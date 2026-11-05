import {
  aplicarRegrasDeTema,
  type DecisaoDeTema,
  NotificacaoSchema,
  notificacaoSegura,
  PropostaDeTemaSchema,
  TemaIdSchema,
} from "@arauto/core";
import { z } from "zod";
import { lerPrompt } from "../config/prompts.js";
import { type ClienteDeModelo, lerJson } from "../modelos/cliente.js";
import { cortar } from "../util/texto.js";

/**
 * O que o modelo devolve. O id é restrito ao catálogo (o código ainda trata id inválido).
 * O texto do aviso NÃO tem limite de tamanho aqui, de propósito: o modelo decide o tema e a
 * ficha de sinais (segurança), e um aviso comprido demais não pode derrubar essa decisão. O
 * limite de 40 e 110 caracteres é aplicado pelo código logo depois.
 */
const PropostaParaOModeloSchema = PropostaDeTemaSchema.extend({
  id: TemaIdSchema,
  notificacao: z.object({ titulo: z.string().min(1), corpo: z.string().min(1) }),
});

export interface HistoriaParaOTema {
  titulo: string;
  resumo: string;
  /** Títulos dos veículos sobre o acontecimento: base do veto por palavras. */
  manchetes: string[];
}

export interface DependenciasDoTema {
  cliente: ClienteDeModelo;
  modelo: string;
}

export interface ResultadoDoTema extends DecisaoDeTema {
  /** Verdadeiro quando o aviso do modelo passou do limite e foi trocado pelo texto seguro. */
  avisoSubstituido: boolean;
}

/** Passo 6: o modelo propõe tema, intensidade, aviso e a ficha de sinais; as regras de segurança decidem. */
export async function executarTema(
  deps: DependenciasDoTema,
  historia: HistoriaParaOTema,
): Promise<ResultadoDoTema> {
  const resposta = await deps.cliente.chamar({
    passo: "tema",
    modelo: deps.modelo,
    sistema: lerPrompt("tema"),
    usuario: [
      `História do dia: ${historia.titulo}`,
      `Resumo: ${historia.resumo}`,
      "Manchetes dos veículos:",
      ...historia.manchetes.slice(0, 10).map((m) => `- ${m}`),
    ].join("\n"),
    maxTokens: 2_000,
    esforco: "low",
    formato: PropostaParaOModeloSchema,
  });
  const proposta = lerJson("tema", resposta.texto, PropostaParaOModeloSchema);

  // Aviso comprido demais: mantém a decisão do modelo e troca só o texto.
  const avisoSubstituido = !NotificacaoSchema.safeParse(proposta.notificacao).success;
  const decisao = aplicarRegrasDeTema(
    avisoSubstituido ? { ...proposta, notificacao: notificacaoSegura(historia.titulo) } : proposta,
    { manchetes: historia.manchetes, tituloDaHistoria: historia.titulo },
  );
  return { ...decisao, avisoSubstituido };
}

/**
 * Quando o passo do modelo falha (recusa, rede, formato), o tema é o neutro. O veto por
 * palavras continua valendo: uma tragédia nas manchetes ainda vira luto.
 */
export function temaDeEmergencia(historia: HistoriaParaOTema): ResultadoDoTema {
  const decisao = aplicarRegrasDeTema(
    {
      id: "neutro",
      intensidade: 1,
      confianca: 1,
      motivo: "Tema neutro por segurança: o passo do modelo falhou.",
      notificacao: { titulo: "Briefing de hoje", corpo: cortar(historia.titulo, 110) },
      sinais: {
        perdaDeVidas: false,
        vitimasConfirmadas: null,
        atentadoOuMassacre: false,
        escaladaMilitar: false,
        armaOuInstalacaoNuclear: false,
        animalEmSofrimento: false,
      },
    },
    { manchetes: historia.manchetes, tituloDaHistoria: historia.titulo },
  );
  return { ...decisao, avisoSubstituido: false };
}
