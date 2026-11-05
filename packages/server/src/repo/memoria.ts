import type { Execucao, Passo, ResultadoPasso, StatusExecucao, UsoDeModelo } from "@arauto/core";
import { mesEmSaoPaulo } from "../util/tempo.js";
import {
  type Dispositivo,
  type DispositivoComHash,
  ExecucaoEmAndamento,
  LIMITE_DE_EXECUCAO_ORFA_MS,
  MAX_TENTATIVAS_DE_CODIGO,
  type NovaExecucao,
  type NovoBriefing,
  type NovoCodigo,
  type NovoDispositivo,
  type RegistroDeBriefing,
  type RepositorioDoServico,
  type ResumoDeExecucao,
} from "./repositorio.js";

interface LinhaDeUso {
  execucaoId: string;
  passo: Passo;
  uso: UsoDeModelo;
  quando: string;
}

interface CodigoGuardado extends NovoCodigo {
  tentativas: number;
  usadoEm: string | null;
}

/** Estado completo do repositório, em forma serializável (usado também pelo repositório em arquivo). */
export interface EstadoEmMemoria {
  execucoes: Execucao[];
  usos: LinhaDeUso[];
  briefings: RegistroDeBriefing[];
  dispositivos: DispositivoComHash[];
  codigos: CodigoGuardado[];
}

export function estadoVazio(): EstadoEmMemoria {
  return { execucoes: [], usos: [], briefings: [], dispositivos: [], codigos: [] };
}

const arredondar = (valor: number) => Math.round(valor * 1_000_000) / 1_000_000;

const paraResumo = (e: Execucao): ResumoDeExecucao => ({
  id: e.id,
  data: e.data,
  tipo: e.tipo,
  status: e.status,
  criadaEm: e.criadaEm,
});

const semHash = ({ tokenHash: _tokenHash, ...resto }: DispositivoComHash): Dispositivo => resto;

export class RepositorioEmMemoria implements RepositorioDoServico {
  protected estado: EstadoEmMemoria;

  constructor(estadoInicial: EstadoEmMemoria = estadoVazio()) {
    this.estado = estadoInicial;
  }

  /** Gancho para o repositório em arquivo gravar em disco depois de cada mudança. */
  protected aoMudar(): void {}

  async criarExecucao(nova: NovaExecucao): Promise<void> {
    // Mesma regra do banco: órfã vira falha, e só uma execução pode estar rodando.
    const limite = Date.parse(nova.criadaEm) - LIMITE_DE_EXECUCAO_ORFA_MS;
    for (const execucao of this.estado.execucoes) {
      if (execucao.status === "rodando" && Date.parse(execucao.criadaEm) < limite) {
        execucao.status = "falhou";
      }
    }
    if (this.estado.execucoes.some((e) => e.status === "rodando")) {
      throw new ExecucaoEmAndamento();
    }
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
    return arredondar(total);
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

  // --- Serviço: limites e histórico ---

  async execucaoEmAndamento(): Promise<ResumoDeExecucao | null> {
    const rodando = this.estado.execucoes.find((e) => e.status === "rodando");
    return rodando ? paraResumo(rodando) : null;
  }

  async encerrarOrfas(antesDe: string): Promise<number> {
    const limite = Date.parse(antesDe);
    let total = 0;
    for (const execucao of this.estado.execucoes) {
      if (execucao.status === "rodando" && Date.parse(execucao.criadaEm) < limite) {
        execucao.status = "falhou";
        total++;
      }
    }
    if (total > 0) this.aoMudar();
    return total;
  }

  async execucoesDaData(data: string): Promise<ResumoDeExecucao[]> {
    return this.estado.execucoes
      .filter((e) => e.data === data)
      .sort((a, b) => a.criadaEm.localeCompare(b.criadaEm))
      .map(paraResumo);
  }

  async historico(limite: number): Promise<RegistroDeBriefing[]> {
    const ultimaPorData = new Map<string, RegistroDeBriefing>();
    for (const registro of this.estado.briefings) {
      const atual = ultimaPorData.get(registro.data);
      if (!atual || registro.versao > atual.versao) ultimaPorData.set(registro.data, registro);
    }
    return [...ultimaPorData.values()]
      .sort((a, b) => b.data.localeCompare(a.data))
      .slice(0, limite);
  }

  async custoMedioDiarioUsd(ultimas: number): Promise<number | null> {
    const gastoPorExecucao = new Map<string, number>();
    for (const linha of this.estado.usos) {
      gastoPorExecucao.set(
        linha.execucaoId,
        (gastoPorExecucao.get(linha.execucaoId) ?? 0) + linha.uso.usd,
      );
    }
    const gastos = this.estado.execucoes
      .filter((e) => e.tipo === "diaria" && e.status === "ok")
      .sort((a, b) => b.criadaEm.localeCompare(a.criadaEm))
      .slice(0, ultimas)
      .map((e) => gastoPorExecucao.get(e.id) ?? 0);
    if (gastos.length === 0) return null;
    return arredondar(gastos.reduce((soma, g) => soma + g, 0) / gastos.length);
  }

  // --- Serviço: acesso por dispositivo ---

  async guardarCodigo(codigo: NovoCodigo): Promise<void> {
    this.estado.codigos.push({ ...codigo, tentativas: 0, usadoEm: null });
    this.aoMudar();
  }

  async consumirCodigo(codigoHash: string, agora: string): Promise<boolean> {
    const codigo = this.estado.codigos.find((c) => c.codigoHash === codigoHash);
    if (
      !codigo ||
      codigo.usadoEm !== null ||
      Date.parse(codigo.expiraEm) <= Date.parse(agora) ||
      codigo.tentativas >= MAX_TENTATIVAS_DE_CODIGO
    ) {
      return false;
    }
    codigo.usadoEm = agora;
    this.aoMudar();
    return true;
  }

  async registrarFalhaDePareamento(agora: string): Promise<void> {
    for (const codigo of this.estado.codigos) {
      if (codigo.usadoEm === null && Date.parse(codigo.expiraEm) > Date.parse(agora)) {
        codigo.tentativas++;
      }
    }
    this.aoMudar();
  }

  async criarDispositivo(novo: NovoDispositivo): Promise<void> {
    if (this.estado.dispositivos.some((d) => d.tokenHash === novo.tokenHash)) {
      throw new Error("Token já existe");
    }
    this.estado.dispositivos.push({
      id: novo.id,
      nome: novo.nome,
      tokenHash: novo.tokenHash,
      criadoEm: novo.criadoEm,
      ultimoUsoEm: null,
      revogadoEm: null,
    });
    this.aoMudar();
  }

  async buscarDispositivoPorToken(tokenHash: string): Promise<DispositivoComHash | null> {
    const dispositivo = this.estado.dispositivos.find((d) => d.tokenHash === tokenHash);
    return dispositivo ? { ...dispositivo } : null;
  }

  async registrarUsoDoDispositivo(id: string, quando: string): Promise<void> {
    const dispositivo = this.estado.dispositivos.find((d) => d.id === id);
    if (!dispositivo) return;
    dispositivo.ultimoUsoEm = quando;
    this.aoMudar();
  }

  async listarDispositivos(): Promise<Dispositivo[]> {
    return this.estado.dispositivos
      .map(semHash)
      .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  }

  async revogarDispositivo(id: string, quando: string): Promise<boolean> {
    const dispositivo = this.estado.dispositivos.find((d) => d.id === id);
    if (!dispositivo || dispositivo.revogadoEm !== null) return false;
    dispositivo.revogadoEm = quando;
    this.aoMudar();
    return true;
  }
}
