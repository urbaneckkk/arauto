import { type Briefing, type Intensidade, normalizarTemaId, type TemaId } from "@arauto/core";
import type { Prefs } from "./prefs";

export interface InfoTema {
  nome: string;
  emoji: string;
  /** Duração da abertura em ms (de 1,5 a 2,5 s, como no contrato de temas). */
  aberturaMs: number;
  /** Há desenho próprio do "Vigia" (true) ou é uma variação provisória deste app (false). */
  desenhado: boolean;
  /** Manchete de exemplo, usada no /lab. */
  exemplo: string;
}

/**
 * Nomes do design "C · Vigia" (docs/design/vigia-direcao-c.png). Os 6 sem desenho no print
 * (nuclear, mercado_queda, tecnologia_ia, politica, esporte, cultura) têm uma versão provisória
 * feita aqui no mesmo estilo, até o pacote do Claude Design chegar.
 */
export const TEMAS: Record<TemaId, InfoTema> = {
  neutro: {
    nome: "Sala de Comando",
    emoji: "🛰️",
    aberturaMs: 1800,
    desenhado: true,
    exemplo: "Dia sem grande assunto único no noticiário",
  },
  ternura_animal: {
    nome: "Patinhas",
    emoji: "🐾",
    aberturaMs: 2000,
    desenhado: true,
    exemplo: "Filhote de capivara é adotado por quartel de bombeiros",
  },
  conflito: {
    nome: "Sala de Situação",
    emoji: "📡",
    aberturaMs: 2000,
    desenhado: true,
    exemplo: "País A mobiliza tropas na fronteira com o País B",
  },
  nuclear: {
    nome: "Alerta Atômico",
    emoji: "☢️",
    aberturaMs: 2200,
    desenhado: false,
    exemplo: "País X testa míssil com capacidade nuclear",
  },
  clima_extremo: {
    nome: "Olho da Tempestade",
    emoji: "⛈️",
    aberturaMs: 2000,
    desenhado: true,
    exemplo: "Tornados e temporais atingem o Sul do país",
  },
  mercado_alta: {
    nome: "Pregão Verde",
    emoji: "📈",
    aberturaMs: 1800,
    desenhado: true,
    exemplo: "Ibovespa dispara e renova máxima histórica",
  },
  mercado_queda: {
    nome: "Pregão Vermelho",
    emoji: "📉",
    aberturaMs: 1800,
    desenhado: false,
    exemplo: "Bolsas despencam e dólar sobe com medo de recessão",
  },
  ciencia_espaco: {
    nome: "Órbita",
    emoji: "🪐",
    aberturaMs: 2200,
    desenhado: true,
    exemplo: "Sonda pousa em Marte e envia as primeiras imagens",
  },
  tecnologia_ia: {
    nome: "Circuito",
    emoji: "🤖",
    aberturaMs: 1800,
    desenhado: false,
    exemplo: "Nova inteligência artificial passa em exame de medicina",
  },
  agro_safra: {
    nome: "Safra",
    emoji: "🌾",
    aberturaMs: 2000,
    desenhado: true,
    exemplo: "Colheita de soja deve bater recorde no Paraná",
  },
  politica: {
    nome: "Plenário",
    emoji: "🏛️",
    aberturaMs: 1800,
    desenhado: false,
    exemplo: "Senado aprova texto que segue para sanção",
  },
  saude: {
    nome: "Plantão",
    emoji: "🩺",
    aberturaMs: 1800,
    desenhado: true,
    exemplo: "Anvisa aprova nova vacina contra a gripe",
  },
  esporte: {
    nome: "Arquibancada",
    emoji: "⚽",
    aberturaMs: 1800,
    desenhado: false,
    exemplo: "Seleção vence e garante vaga na final",
  },
  cultura: {
    nome: "Cortina",
    emoji: "🎭",
    aberturaMs: 1800,
    desenhado: false,
    exemplo: "Festival de cinema abre com filme brasileiro",
  },
  luto: {
    nome: "Silêncio",
    emoji: "🕯️",
    aberturaMs: 1500,
    desenhado: true,
    exemplo: "Desastre deixa dezenas de vítimas no litoral",
  },
};

export interface TemaAtivo {
  id: TemaId;
  intensidade: Intensidade;
}

/**
 * Qual tema a tela usa. Modo sóbrio: sempre neutro. Troca manual: o escolhido. Senão, o do dia
 * (id desconhecido ou fora do catálogo cai em neutro, sem erro). Em luto nunca se anima nem se
 * troca por outro tema por engano: a regra é aplicada pelo servidor.
 */
export function temaAtivo(briefing: Briefing | null, prefs: Prefs): TemaAtivo {
  if (prefs.sobrio) return { id: "neutro", intensidade: 1 };
  if (prefs.temaManual) return { id: prefs.temaManual, intensidade: 2 };
  if (!briefing) return { id: "neutro", intensidade: 1 };
  return { id: normalizarTemaId(briefing.tema.id), intensidade: briefing.tema.intensidade };
}
