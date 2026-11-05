import { SECAO_IDS } from "@arauto/core";
import { z } from "zod";
import { type CoberturaGdelt, consultarGdelt } from "../coleta/gdelt.js";
import type { ItemColetado } from "../coleta/tipos.js";
import { lerPrompt } from "../config/prompts.js";
import type { Logger } from "../infra/log.js";
import type { Transporte } from "../infra/transporte.js";
import { type ClienteDeModelo, lerJson, RespostaInvalida } from "../modelos/cliente.js";
import type { Relogio } from "../util/tempo.js";
import { pontuarComGdelt, pontuarSemGdelt, recencia } from "./pontuacao.js";
import type { Categoria, Pausa } from "./tipos.js";

const CATEGORIAS = [...SECAO_IDS, "curiosidade", "descartar"] as const;

export const AgrupamentoSchema = z.object({
  acontecimentos: z.array(
    z.object({
      titulo: z.string().min(1),
      categoria: z.enum(CATEGORIAS),
      itens: z.array(z.string()).min(1),
      consultaGdelt: z.string(),
    }),
  ),
});

export interface ClusterPontuado {
  id: string;
  titulo: string;
  categoria: Categoria;
  itens: ItemColetado[];
  consultaGdelt: string;
  veiculos: number;
  paises: number;
  recencia: number;
  pontuacao: number;
  /** Verdadeiro quando a pontuação saiu só do RSS (sem GDELT). */
  pontuacaoParcial: boolean;
  gdelt: CoberturaGdelt | null;
}

export interface ResultadoDoTermometro {
  clusters: ClusterPontuado[];
  historiaDoDia: ClusterPontuado;
  parcial: boolean;
  gdeltConsultas: number;
  gdeltFalhas: number;
}

export interface DependenciasDoTermometro {
  cliente: ClienteDeModelo;
  transporte: Transporte;
  relogio: Relogio;
  log: Logger;
  modelo: string;
  pausa: Pausa;
}

/** Quantos acontecimentos (os de maior pontuação só com RSS) consultam o GDELT. */
export const CANDIDATOS_GDELT = 5;
/** O GDELT limita a 1 chamada a cada 5 s. */
export const PAUSA_ENTRE_CONSULTAS_MS = 8_000;
/** Depois de tantas falhas seguidas, desiste do GDELT neste dia (ele falha muito). */
export const FALHAS_SEGUIDAS_PARA_DESISTIR = 2;

export function listaParaAgrupar(itens: readonly ItemColetado[]): string {
  return itens
    .map((item) => `${item.id} | ${item.veiculo} | ${item.dica ?? "-"} | ${item.titulo}`)
    .join("\n");
}

const distintos = (valores: readonly string[]) => new Set(valores).size;

/**
 * Qualidade mínima do agrupamento, só exigida com bastante material (uma execução real tem ~720
 * itens). Na 2ª execução real o Haiku devolveu UM acontecimento, com ids malformados, e o briefing
 * saiu com 3 notícias. Agrupamento pobre é erro: o passo é repetido.
 */
export const ITENS_PARA_EXIGIR_QUALIDADE = 100;
export const MIN_ACONTECIMENTOS = 15;
export const MIN_COBERTURA_DOS_ITENS = 0.25;

/** O modelo às vezes escreve "015" ou "15" em vez de "i015". Aceita as três formas. */
export function normalizarId(id: string): string {
  const limpo = id.trim().toLowerCase();
  const digitos = limpo.match(/^i?(\d+)$/)?.[1];
  return digitos ? `i${digitos.padStart(3, "0")}` : limpo;
}

/** Passo 2: o modelo agrupa as manchetes por acontecimento; o CÓDIGO calcula a pontuação. */
export async function executarTermometro(
  deps: DependenciasDoTermometro,
  itens: readonly ItemColetado[],
): Promise<ResultadoDoTermometro> {
  const { cliente, transporte, relogio, log, modelo, pausa } = deps;
  const agora = relogio.agora();
  const porId = new Map(itens.map((item) => [item.id, item]));

  const resposta = await cliente.chamar({
    passo: "termometro",
    modelo,
    sistema: lerPrompt("termometro"),
    usuario: listaParaAgrupar(itens),
    // O raciocínio entra no limite de saída: no esforço médio chega a ~25 mil tokens (medido em 04/11).
    maxTokens: 32_000,
    esforco: "medium",
    formato: AgrupamentoSchema,
  });
  const agrupamento = lerJson("termometro", resposta.texto, AgrupamentoSchema);

  // Valida o que o modelo devolveu: só ids que existem, cada item em um único grupo.
  const usados = new Set<string>();
  const clusters: ClusterPontuado[] = [];
  for (const acontecimento of agrupamento.acontecimentos) {
    const membros: ItemColetado[] = [];
    for (const id of acontecimento.itens) {
      const idNormal = normalizarId(id);
      const item = porId.get(idNormal);
      if (!item || usados.has(idNormal)) continue;
      usados.add(idNormal);
      membros.push(item);
    }
    if (membros.length === 0) continue;
    const veiculos = distintos(membros.map((m) => m.veiculo));
    const itensRecencia = recencia(
      membros.map((m) => m.publicadoEm),
      agora,
    );
    clusters.push({
      id: `c${String(clusters.length + 1).padStart(2, "0")}`,
      titulo: acontecimento.titulo,
      categoria: acontecimento.categoria,
      itens: membros,
      consultaGdelt: acontecimento.consultaGdelt,
      veiculos,
      paises: distintos(membros.map((m) => m.pais)),
      recencia: itensRecencia,
      pontuacao: pontuarSemGdelt({ veiculos, recencia: itensRecencia }),
      pontuacaoParcial: true,
      gdelt: null,
    });
  }

  if (itens.length >= ITENS_PARA_EXIGIR_QUALIDADE) {
    const cobertura = usados.size / itens.length;
    if (clusters.length < MIN_ACONTECIMENTOS || cobertura < MIN_COBERTURA_DOS_ITENS) {
      throw new RespostaInvalida(
        "termometro",
        `agrupamento pobre: ${clusters.length} acontecimentos cobrindo ${Math.round(cobertura * 100)}% dos ${itens.length} itens (mínimo: ${MIN_ACONTECIMENTOS} acontecimentos e ${Math.round(MIN_COBERTURA_DOS_ITENS * 100)}%)`,
      );
    }
  }

  const elegiveis = clusters.filter((c) => c.categoria !== "descartar");
  if (elegiveis.length === 0) {
    throw new Error("O termômetro não encontrou nenhum acontecimento relevante nas manchetes.");
  }
  const ordem = (a: ClusterPontuado, b: ClusterPontuado) =>
    b.pontuacao - a.pontuacao || b.veiculos - a.veiculos || b.recencia - a.recencia;
  elegiveis.sort(ordem);

  // GDELT: só para os candidatos, com disjuntor para não gastar minutos em um serviço fora do ar.
  const candidatos = elegiveis.slice(0, CANDIDATOS_GDELT);
  let consultas = 0;
  let falhas = 0;
  let falhasSeguidas = 0;
  for (const candidato of candidatos) {
    if (falhasSeguidas >= FALHAS_SEGUIDAS_PARA_DESISTIR) {
      falhas++;
      continue;
    }
    if (consultas > 0) await pausa(PAUSA_ENTRE_CONSULTAS_MS);
    consultas++;
    const cobertura = await consultarGdelt(transporte, candidato.consultaGdelt);
    if (cobertura) {
      candidato.gdelt = cobertura;
      falhasSeguidas = 0;
    } else {
      falhas++;
      falhasSeguidas++;
    }
  }

  // Comparar acontecimentos com métodos diferentes seria injusto: só vale o GDELT se TODOS
  // os candidatos o tiverem. Caso contrário, todos ficam com a pontuação só do RSS.
  const parcial = candidatos.length === 0 || falhas > 0;
  let historiaDoDia = elegiveis[0] as ClusterPontuado;
  if (!parcial) {
    for (const candidato of candidatos) {
      const g = candidato.gdelt as CoberturaGdelt;
      const veiculos = Math.max(g.dominios.length, candidato.veiculos);
      const paises = Math.max(g.paises.length, candidato.paises);
      candidato.veiculos = veiculos;
      candidato.paises = paises;
      candidato.pontuacao = pontuarComGdelt({
        veiculos,
        paises,
        recencia: candidato.recencia,
        artigos: g.artigos,
      });
      candidato.pontuacaoParcial = false;
    }
    candidatos.sort(ordem);
    historiaDoDia = candidatos[0] as ClusterPontuado;
  }

  log.info(
    `Termômetro: ${clusters.length} acontecimentos; história do dia: "${historiaDoDia.titulo}" ` +
      `(pontuação ${historiaDoDia.pontuacao}${parcial ? ", parcial: sem GDELT" : ""}).`,
  );
  return {
    clusters: [...clusters].sort(ordem),
    historiaDoDia,
    parcial,
    gdeltConsultas: consultas,
    gdeltFalhas: falhas,
  };
}
