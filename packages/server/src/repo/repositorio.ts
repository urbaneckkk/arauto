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

/** Uma execução sem os passos: o que o serviço precisa para contar, limitar e informar. */
export type ResumoDeExecucao = Pick<Execucao, "id" | "data" | "tipo" | "status" | "criadaEm">;

/**
 * Já existe uma execução rodando. O banco só admite uma por vez (PLAN.md, seção 2.8, item 4):
 * quem chega depois recebe este erro e devolve a execução em andamento.
 */
export class ExecucaoEmAndamento extends Error {
  constructor() {
    super("Já existe uma execução em andamento.");
    this.name = "ExecucaoEmAndamento";
  }
}

/**
 * Uma execução 'rodando' há mais que isso morreu junto com o processo (o prazo do pipeline é de
 * 25 minutos). O repositório a marca como falha ao criar a próxima, para a trava nunca prender.
 */
export const LIMITE_DE_EXECUCAO_ORFA_MS = 30 * 60_000;

/** Tentativas erradas toleradas antes de um código de pareamento morrer (PLAN.md, seção 2.8, item 2). */
export const MAX_TENTATIVAS_DE_CODIGO = 5;

/**
 * Tudo que o pipeline grava. Há três implementações: memória (testes), arquivo local
 * (rodar sem banco) e Postgres (Railway).
 */
export interface Repositorio {
  /** Lança `ExecucaoEmAndamento` se já houver outra rodando (e não for órfã). */
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

/** Um aparelho pareado. O token nunca é guardado, só o hash. */
export interface Dispositivo {
  id: string;
  nome: string;
  criadoEm: string;
  ultimoUsoEm: string | null;
  revogadoEm: string | null;
}

export interface DispositivoComHash extends Dispositivo {
  tokenHash: string;
}

export interface NovoCodigo {
  codigoHash: string;
  criadoEm: string;
  expiraEm: string;
}

export interface NovoDispositivo {
  id: string;
  nome: string;
  tokenHash: string;
  criadoEm: string;
}

/**
 * Tudo que o serviço (API e agendador) precisa além do pipeline: limites, histórico e acesso por
 * dispositivo. As três implementações (memória, arquivo e Postgres) passam pelos mesmos testes.
 */
export interface RepositorioDoServico extends Repositorio {
  execucaoEmAndamento(): Promise<ResumoDeExecucao | null>;
  /** Marca como 'falhou' as execuções 'rodando' criadas antes do instante. Devolve quantas. */
  encerrarOrfas(antesDe: string): Promise<number>;
  /** Execuções cuja `data` (São Paulo) é a informada, da mais antiga à mais nova. */
  execucoesDaData(data: string): Promise<ResumoDeExecucao[]>;
  /** A última versão de cada data, da mais recente à mais antiga, até `limite` datas. */
  historico(limite: number): Promise<RegistroDeBriefing[]>;
  /** Média do gasto das últimas execuções 'diaria' bem-sucedidas, ou nulo se ainda não há. */
  custoMedioDiarioUsd(ultimas: number): Promise<number | null>;

  guardarCodigo(codigo: NovoCodigo): Promise<void>;
  /** Consome o código se ele existir, não tiver expirado, nem sido usado, nem queimado por erros. */
  consumirCodigo(codigoHash: string, agora: string): Promise<boolean>;
  /** Conta uma tentativa errada em todos os códigos ainda válidos (quem tenta adivinhar queima todos). */
  registrarFalhaDePareamento(agora: string): Promise<void>;
  criarDispositivo(dispositivo: NovoDispositivo): Promise<void>;
  buscarDispositivoPorToken(tokenHash: string): Promise<DispositivoComHash | null>;
  registrarUsoDoDispositivo(id: string, quando: string): Promise<void>;
  listarDispositivos(): Promise<Dispositivo[]>;
  /** Verdadeiro se revogou agora; falso se não existe ou já estava revogado. */
  revogarDispositivo(id: string, quando: string): Promise<boolean>;
}
