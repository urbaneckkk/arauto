import {
  aplicarRegrasDeTema,
  type DecisaoDeTema,
  PropostaDeTemaSchema,
  TemaIdSchema,
} from "@arauto/core";
import { lerPrompt } from "../config/prompts.js";
import { type ClienteDeModelo, lerJson } from "../modelos/cliente.js";
import { cortar } from "../util/texto.js";

/** Para o modelo, o id é restrito ao catálogo; o código ainda trata id inválido. */
const PropostaParaOModeloSchema = PropostaDeTemaSchema.extend({ id: TemaIdSchema });

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

/** Passo 6: o modelo propõe tema, intensidade, aviso e a ficha de sinais; as regras de segurança decidem. */
export async function executarTema(
  deps: DependenciasDoTema,
  historia: HistoriaParaOTema,
): Promise<DecisaoDeTema> {
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
  return aplicarRegrasDeTema(proposta, {
    manchetes: historia.manchetes,
    tituloDaHistoria: historia.titulo,
  });
}

/**
 * Quando o passo do modelo falha (recusa, rede, formato), o tema é o neutro. O veto por
 * palavras continua valendo: uma tragédia nas manchetes ainda vira luto.
 */
export function temaDeEmergencia(historia: HistoriaParaOTema): DecisaoDeTema {
  return aplicarRegrasDeTema(
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
}
