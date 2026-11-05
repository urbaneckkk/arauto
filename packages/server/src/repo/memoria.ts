import type { Execucao, Passo, ResultadoPasso, StatusExecucao, UsoDeModelo } from "@arauto/core";
import { mesEmSaoPaulo } from "../util/tempo.js";
import type { NovaExecucao, NovoBriefing, RegistroDeBriefing, Repositorio } from "./repositorio.js";

interface LinhaDeUso {
  execucaoId: string;
  passo: Passo;
  uso: UsoDeModelo;
  quando: string;
}

/** Estado completo do repositório, em forma serializável (usado também pelo repositório em arquivo). */
export interface EstadoEmMemoria {
  execucoes: Execucao[];
  usos: LinhaDeUso[];
  briefings: RegistroDeBriefing[];
}

export function estadoVazio(): EstadoEmMemoria {
  return { execucoes: [], usos: [], briefings: [] };
}

export class RepositorioEmMemoria implements Repositorio {
  protected estado: EstadoEmMemoria;

  constructor(estadoInicial: EstadoEmMemoria = estadoVazio()) {
    this.estado = estadoInicial;
  }

  /** Gancho para o repositório em arquivo gravar em disco depois de cada mudança. */
  protected aoMudar(): void {}

  async criarExecucao(nova: NovaExecucao): Promise<void> {
    this.estado.execucoes.push({
      id: nova.id,
      data: nova.data,
      tipo: nova.tipo,
      status: "rodando",
      criadaEm: nova.criadaEm,
      passos: [],
    });
    this.aoMudar();
  }

  async atualizarStatus(id: string, status: StatusExecucao): Promise<void> {
    const execucao = this.estado.execucoes.find((e) => e.id === id);
    if (!execucao) throw new Error(`Execução ${id} não existe`);
    execucao.status = status;
    this.aoMudar();
  }

  async gravarPasso(execucaoId: string, resultado: ResultadoPasso): Promise<void> {
    const execucao = this.estado.execucoes.find((e) => e.id === execucaoId);
    if (!execucao) throw new Error(`Execução ${execucaoId} não existe`);
    execucao.passos.push(resultado);
    this.aoMudar();
  }

  async gravarUso(
    execucaoId: string,
    passo: Passo,
    uso: UsoDeModelo,
    quando: string,
  ): Promise<void> {
    this.estado.usos.push({ execucaoId, passo, uso, quando });
    this.aoMudar();
  }

  async gastoDoMesUsd(mes: string): Promise<number> {
    const total = this.estado.usos
      .filter((linha) => mesEmSaoPaulo(new Date(linha.quando)) === mes)
      .reduce((soma, linha) => soma + linha.uso.usd, 0);
    return Math.round(total * 1_000_000) / 1_000_000;
  }

  async gravarBriefing(novo: NovoBriefing): Promise<number> {
    const versoes = this.estado.briefings.filter((b) => b.data === novo.data).map((b) => b.versao);
    const versao = (versoes.length > 0 ? Math.max(...versoes) : 0) + 1;
    this.estado.briefings.push({ ...novo, versao });
    this.aoMudar();
    return versao;
  }

  async ultimoBriefing(): Promise<RegistroDeBriefing | null> {
    const ordenados = [...this.estado.briefings].sort(
      (a, b) => b.data.localeCompare(a.data) || b.versao - a.versao,
    );
    return ordenados[0] ?? null;
  }

  async briefingDaData(data: string): Promise<RegistroDeBriefing | null> {
    const daData = this.estado.briefings
      .filter((b) => b.data === data)
      .sort((a, b) => b.versao - a.versao);
    return daData[0] ?? null;
  }

  async buscarExecucao(id: string): Promise<Execucao | null> {
    return this.estado.execucoes.find((e) => e.id === id) ?? null;
  }

  async ultimaExecucao(): Promise<Execucao | null> {
    const ordenadas = [...this.estado.execucoes].sort((a, b) =>
      b.criadaEm.localeCompare(a.criadaEm),
    );
    return ordenadas[0] ?? null;
  }
}
