import type { Alerta, SecaoId } from "@arauto/core";

/** Dica de seção: de onde o feed costuma vir. O modelo confirma ou corrige (passo 2). */
export type Dica = SecaoId | "curiosidade";

export interface FeedConfig {
  id: string;
  nome: string;
  /** Nome do veículo como aparece no briefing. */
  veiculo: string;
  url: string;
  pais: string;
  idioma: "pt" | "en";
  dica?: Dica;
  /** Quantos itens, no máximo, entram na coleta (os mais recentes). */
  limite?: number;
}

export interface ItemColetado {
  /** Identificador interno (i001, i002...). O redator cita fontes por este id. */
  id: string;
  feedId: string;
  veiculo: string;
  pais: string;
  idioma: "pt" | "en";
  titulo: string;
  url: string;
  /** Instante ISO. Item sem data é descartado na coleta. */
  publicadoEm: string;
  /** Resumo do feed, limpo e curto. Fica só em memória: não vai para o banco (PLAN.md, D11). */
  resumo: string;
  dica?: Dica;
}

export type SituacaoDoFeed = "ok" | "parado" | "vazio" | "fora";

/** Resultado do teste "esse feed está ativo?" (briefing, passo 1). */
export interface SaudeDoFeed {
  feedId: string;
  situacao: SituacaoDoFeed;
  status: number | null;
  /** Itens lidos do feed, antes de filtrar por data. */
  itens: number;
  maisRecente: string | null;
  ms: number;
  erro?: string;
}

export interface DadosDoTempo {
  minC: number;
  maxC: number;
  chuvaPct: number;
  chuvaMm: number;
  codigoDoTempo: number;
  descricaoDoTempo: string;
}

/** Alerta do INMET para Curitiba, com os textos extras que só o redator usa. */
export interface AlertaDoInmet extends Alerta {
  riscos: string[];
  instrucoes: string[];
  quando: "hoje" | "futuro";
}

export interface ResultadoDaColeta {
  /** Instante da coleta (ISO). */
  agora: string;
  itens: ItemColetado[];
  saude: SaudeDoFeed[];
  tempo: DadosDoTempo | null;
  alertas: AlertaDoInmet[];
  /** Avisos de qualidade para o briefing e para o log. */
  avisos: string[];
}
