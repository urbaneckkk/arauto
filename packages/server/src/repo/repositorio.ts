import type {
  Briefing,
  Execucao,
  Passo,
  ResultadoPasso,
  StatusExecucao,
  TipoExecucao,
  UsoDeModelo,
} from "@arauto/core";

export interface RegistroDeBriefing {
  data: string;
  versao: number;
  execucaoId: string;
  tipo: TipoExecucao;
  criadoEm: string;
  briefing: Briefing;
  /** Avisos de qualidade (feeds parados, GDELT fora, apuração ausente...). */
  avisos: string[];
}

export type NovoBriefing = Omit<RegistroDeBriefing, "versao">;

export interface NovaExecucao {
  id: string;
  data: string;
  tipo: TipoExecucao;
  criadaEm: string;
}

/**
 * Tudo que o pipeline grava. Há três implementações: memória (testes), arquivo local
 * (rodar sem banco) e Postgres (Railway).
 */
export interface Repositorio {
  criarExecucao(execucao: NovaExecucao): Promise<void>;
  atualizarStatus(id: string, status: StatusExecucao): Promise<void>;
  gravarPasso(execucaoId: string, resultado: ResultadoPasso): Promise<void>;
  /** Livro-caixa: uma linha por chamada ao modelo. */
  gravarUso(execucaoId: string, passo: Passo, uso: UsoDeModelo, quando: string): Promise<void>;
  /** Total gasto no mês (AAAA-MM), somando todas as execuções. */
  gastoDoMesUsd(mes: string): Promise<number>;
  /** Grava uma nova versão do briefing da data e devolve o número da versão. */
  gravarBriefing(novo: NovoBriefing): Promise<number>;
  ultimoBriefing(): Promise<RegistroDeBriefing | null>;
  briefingDaData(data: string): Promise<RegistroDeBriefing | null>;
  buscarExecucao(id: string): Promise<Execucao | null>;
  ultimaExecucao(): Promise<Execucao | null>;
}
