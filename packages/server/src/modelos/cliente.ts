import type { Passo, UsoDeModelo } from "@arauto/core";
import type { ZodType } from "zod";
import type { Orcamento } from "../custo/orcamento.js";
import { estimarPiorCasoUsd, estimarTokens } from "../custo/precos.js";
import type { Repositorio } from "../repo/repositorio.js";
import type { Relogio } from "../util/tempo.js";

export type Esforco = "low" | "medium" | "high";

export interface BuscaWeb {
  url: string;
  titulo: string;
  /** Idade da página como a busca informou ("April 30, 2026", "2 days ago"...), ou null. */
  idade: string | null;
}

export interface ChamadaDeModelo {
  passo: Passo;
  modelo: string;
  sistema: string;
  usuario: string;
  maxTokens: number;
  esforco: Esforco;
  /** Quando presente, a resposta é um JSON que obedece a este esquema. */
  formato?: ZodType;
  /** Busca web da Anthropic, restrita a estes domínios. */
  busca?: { maxBuscas: number; dominios: readonly string[] };
}

export interface RespostaDoModelo {
  texto: string;
  resultadosDeBusca: BuscaWeb[];
  uso: UsoDeModelo;
  /** end_turn, max_tokens, refusal, pause_turn... */
  motivoDeParada: string;
}

export interface ClienteDeModelo {
  chamar(chamada: ChamadaDeModelo): Promise<RespostaDoModelo>;
}

/** O classificador de segurança do modelo recusou. Conta como falha do passo, nunca como texto. */
export class ModeloRecusou extends Error {
  constructor(passo: Passo, detalhe: string) {
    super(`O modelo recusou a chamada do passo "${passo}": ${detalhe}`);
    this.name = "ModeloRecusou";
  }
}

/** A resposta bateu em max_tokens e veio incompleta. */
export class RespostaCortada extends Error {
  constructor(passo: Passo) {
    super(`A resposta do passo "${passo}" foi cortada por limite de tokens.`);
    this.name = "RespostaCortada";
  }
}

/** A resposta não é o JSON esperado. */
export class RespostaInvalida extends Error {
  constructor(passo: Passo, detalhe: string) {
    super(`A resposta do passo "${passo}" não obedece ao formato: ${detalhe}`);
    this.name = "RespostaInvalida";
  }
}

/** Cada busca web traz resultados que são relidos nas rodadas seguintes: estimativa de pior caso. */
const TOKENS_EXTRAS_POR_BUSCA = 20_000;

/**
 * Aplica as travas de custo em volta de qualquer cliente: verifica o pior caso ANTES,
 * registra o uso real DEPOIS (no orçamento e no livro-caixa) e trata recusa e corte.
 */
export class ClienteComOrcamento implements ClienteDeModelo {
  constructor(
    private readonly base: ClienteDeModelo,
    private readonly orcamento: Orcamento,
    private readonly repo: Repositorio,
    private readonly execucaoId: string,
    private readonly relogio: Relogio,
  ) {}

  async chamar(chamada: ChamadaDeModelo): Promise<RespostaDoModelo> {
    const buscas = chamada.busca?.maxBuscas ?? 0;
    const entrada =
      estimarTokens(chamada.sistema + chamada.usuario) + buscas * TOKENS_EXTRAS_POR_BUSCA;
    this.orcamento.verificarAntes(
      estimarPiorCasoUsd(chamada.modelo, entrada, chamada.maxTokens, buscas),
    );

    const resposta = await this.base.chamar(chamada);

    // O que foi gasto conta mesmo que a resposta seja recusada ou cortada.
    this.orcamento.registrar(resposta.uso);
    await this.repo.gravarUso(
      this.execucaoId,
      chamada.passo,
      resposta.uso,
      this.relogio.agora().toISOString(),
    );

    if (resposta.motivoDeParada === "refusal") {
      throw new ModeloRecusou(chamada.passo, "stop_reason = refusal");
    }
    if (resposta.motivoDeParada === "max_tokens") throw new RespostaCortada(chamada.passo);
    return resposta;
  }
}

/** Tira cercas de código (```json) e lê o JSON, validando com o esquema. */
export function lerJson<T>(passo: Passo, texto: string, esquema: ZodType<T>): T {
  const semCerca = texto
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let bruto: unknown;
  try {
    bruto = JSON.parse(semCerca);
  } catch {
    throw new RespostaInvalida(passo, "o texto não é JSON");
  }
  const resultado = esquema.safeParse(bruto);
  if (!resultado.success) {
    const problemas = resultado.error.issues
      .slice(0, 5)
      .map((p) => `${p.path.join(".") || "(raiz)"}: ${p.message}`)
      .join("; ");
    throw new RespostaInvalida(passo, problemas);
  }
  return resultado.data;
}
