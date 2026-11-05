import { randomUUID } from "node:crypto";
import type { TipoExecucao } from "@arauto/core";
import type { Logger } from "../infra/log.js";
import type { ResultadoDaExecucao } from "../pipeline/executar.js";
import {
  ExecucaoEmAndamento,
  type RepositorioDoServico,
  type ResumoDeExecucao,
} from "../repo/repositorio.js";
import { dataEmSaoPaulo, mesEmSaoPaulo, type Relogio } from "../util/tempo.js";
import { inicioDoProximoDia, MINUTO_DE_ATRASO, minutosDoDiaEmSaoPaulo } from "./calendario.js";
import {
  CUSTO_DIARIO_PADRAO_USD,
  calcularReservaUsd,
  EXECUCOES_NA_MEDIA,
  type NivelDeGasto,
  nivelDeGasto,
} from "./orcamento-mensal.js";

export interface OpcoesDeExecucao {
  gerarId: () => string;
  aoIniciar: (execucaoId: string) => void;
  reservaUsd: number;
}

/** Roda o pipeline de verdade (ou um falso, nos testes). */
export type Executor = (
  tipo: TipoExecucao,
  opcoes: OpcoesDeExecucao,
) => Promise<ResultadoDaExecucao>;

export interface LimitesDoServico {
  /** "Atualizar agora": no máximo isto por dia, somando todos os aparelhos. */
  atualizacoesPorDia: number;
  intervaloEntreAtualizacoesMin: number;
  maxUsdMes: number;
  /** GASTOS_PAUSADOS: nada pago roda. */
  pausado: boolean;
  /** Falso quando falta a chave da Anthropic: o servidor lê e serve, mas não gera. */
  geracaoDisponivel: boolean;
}

export interface ConfigDoOrquestrador {
  repo: RepositorioDoServico;
  executar: Executor;
  relogio: Relogio;
  log: Logger;
  limites: LimitesDoServico;
  gerarId?: () => string;
}

export type MotivoDeRecusa =
  | "sem_chave"
  | "pausado"
  | "limite_diario"
  | "intervalo"
  | "teto_mensal"
  | "reserva";

export type ResultadoDoPedido =
  | { situacao: "iniciada"; execucaoId: string }
  | { situacao: "em_andamento"; execucaoId: string }
  | { situacao: "recusada"; motivo: MotivoDeRecusa; mensagem: string; tentarEm: string | null };

export interface EstadoDoServico {
  agora: string;
  hoje: string;
  emAndamento: { id: string; tipo: TipoExecucao } | null;
  ultimaExecucao: ResumoDeExecucao | null;
  /** Já existe algum briefing com a data de hoje. */
  briefingDoDia: boolean;
  /** Passou das 06:40 e ainda não há briefing de hoje: a interface mostra o de ontem com aviso. */
  briefingAtrasado: boolean;
  atualizacoes: {
    usadasHoje: number;
    limite: number;
    /** Quando o próximo "Atualizar agora" é liberado; nulo se já pode. */
    liberadaEm: string | null;
  };
  gastos: {
    mesUsd: number;
    tetoUsd: number;
    nivel: NivelDeGasto;
    pausado: boolean;
    /** O servidor só lê: gastos pausados, teto do mês atingido ou sem chave. */
    modoLeitura: boolean;
  };
}

const usd = (valor: number) => `US$ ${valor.toFixed(2)}`;

/**
 * O único lugar que decide se uma execução paga pode começar (PLAN.md, seção 2.8): o agendador e o
 * "Atualizar agora" passam por aqui, e todo o resto lê do banco.
 */
export class Orquestrador {
  /** Pedidos andam um de cada vez: "verificar os limites e começar" nunca é interrompido por outro. */
  private fila: Promise<unknown> = Promise.resolve();
  private emCurso: { id: string; tipo: TipoExecucao; fim: Promise<void> } | null = null;

  constructor(private readonly config: ConfigDoOrquestrador) {}

  get geracaoDisponivel(): boolean {
    return this.config.limites.geracaoDisponivel;
  }

  /** Espera a execução em curso terminar (desligamento limpo e testes). */
  async aguardar(): Promise<void> {
    while (this.emCurso) await this.emCurso.fim;
  }

  private serializar<T>(trabalho: () => Promise<T>): Promise<T> {
    const proximo = this.fila.then(trabalho);
    // A fila nunca fica "rejeitada": um pedido que deu erro não trava os seguintes.
    this.fila = proximo.catch(() => {});
    return proximo;
  }

  // --- Pedidos ---

  /** O botão "Atualizar agora". Cada recusa diz o porquê em português e quando tentar de novo. */
  pedirAtualizacao(): Promise<ResultadoDoPedido> {
    return this.serializar(() => this.avaliarAtualizacao());
  }

  /** O briefing das 06:00 (chamado pelo agendador). Não tem limite de pedidos, só o de custo do pipeline. */
  iniciarDiaria(): Promise<ResultadoDoPedido> {
    return this.serializar(async () => {
      const emAndamento = await this.andamento();
      if (emAndamento) return { situacao: "em_andamento", execucaoId: emAndamento.id };
      if (!this.config.limites.geracaoDisponivel) return this.recusa("sem_chave");
      return this.partir("diaria", 0);
    });
  }

  private async avaliarAtualizacao(): Promise<ResultadoDoPedido> {
    const { limites, relogio, repo } = this.config;
    const agora = relogio.agora();
    const hoje = dataEmSaoPaulo(agora);

    // Vários cliques viram um: quem pede durante uma execução recebe a mesma, sem gastar do limite.
    const emAndamento = await this.andamento();
    if (emAndamento) return { situacao: "em_andamento", execucaoId: emAndamento.id };

    if (!limites.geracaoDisponivel) return this.recusa("sem_chave");
    if (limites.pausado) return this.recusa("pausado");

    const doDia = await repo.execucoesDaData(hoje);
    const atualizacoes = doDia.filter((e) => e.tipo === "atualizacao");
    if (atualizacoes.length >= limites.atualizacoesPorDia) {
      return this.recusa("limite_diario", inicioDoProximoDia(agora));
    }
    const ultima = atualizacoes.at(-1);
    if (ultima) {
      const liberadaEm =
        Date.parse(ultima.criadaEm) + limites.intervaloEntreAtualizacoesMin * 60_000;
      if (agora.getTime() < liberadaEm) {
        return this.recusa("intervalo", new Date(liberadaEm).toISOString());
      }
    }

    const gastoMes = await repo.gastoDoMesUsd(mesEmSaoPaulo(agora));
    if (gastoMes >= limites.maxUsdMes) return this.recusa("teto_mensal");
    const custoDiario = await this.custoDiarioUsd();
    const reserva = calcularReservaUsd({
      hoje,
      briefingDeHojeJaGerado: doDia.some((e) => e.tipo === "diaria" && e.status === "ok"),
      custoDiarioUsd: custoDiario,
    });
    // Estimativa de uma atualização = um briefing médio. O pipeline ainda confere, chamada a
    // chamada, pelo pior caso (Orcamento): esta checagem só evita começar o que já nasce barrado.
    if (gastoMes + custoDiario > limites.maxUsdMes - reserva) {
      return this.recusa(
        "reserva",
        null,
        `Atualizar agora custaria cerca de ${usd(custoDiario)} e invadiria a verba reservada para os briefings diários (${usd(reserva)} para os dias que faltam; gasto do mês: ${usd(gastoMes)} de ${usd(limites.maxUsdMes)}).`,
      );
    }
    return this.partir("atualizacao", reserva);
  }

  // --- Estado ---

  async estado(): Promise<EstadoDoServico> {
    const { limites, relogio, repo } = this.config;
    const agora = relogio.agora();
    const hoje = dataEmSaoPaulo(agora);
    const [doDia, ultimaExecucao, briefingDeHoje, gastoMes, emAndamento] = await Promise.all([
      repo.execucoesDaData(hoje),
      repo.ultimaExecucao(),
      repo.briefingDaData(hoje),
      repo.gastoDoMesUsd(mesEmSaoPaulo(agora)),
      this.andamento(),
    ]);

    const atualizacoes = doDia.filter((e) => e.tipo === "atualizacao");
    const ultima = atualizacoes.at(-1);
    let liberadaEm: string | null = null;
    if (atualizacoes.length >= limites.atualizacoesPorDia) {
      liberadaEm = inicioDoProximoDia(agora);
    } else if (ultima) {
      const quando = Date.parse(ultima.criadaEm) + limites.intervaloEntreAtualizacoesMin * 60_000;
      if (quando > agora.getTime()) liberadaEm = new Date(quando).toISOString();
    }

    const tetoAtingido = gastoMes >= limites.maxUsdMes;
    return {
      agora: agora.toISOString(),
      hoje,
      emAndamento: emAndamento ? { id: emAndamento.id, tipo: emAndamento.tipo } : null,
      ultimaExecucao: ultimaExecucao
        ? {
            id: ultimaExecucao.id,
            data: ultimaExecucao.data,
            tipo: ultimaExecucao.tipo,
            status: ultimaExecucao.status,
            criadaEm: ultimaExecucao.criadaEm,
          }
        : null,
      briefingDoDia: briefingDeHoje !== null,
      briefingAtrasado:
        briefingDeHoje === null && minutosDoDiaEmSaoPaulo(agora) >= MINUTO_DE_ATRASO,
      atualizacoes: {
        usadasHoje: atualizacoes.length,
        limite: limites.atualizacoesPorDia,
        liberadaEm,
      },
      gastos: {
        mesUsd: gastoMes,
        tetoUsd: limites.maxUsdMes,
        nivel: nivelDeGasto(gastoMes, limites.maxUsdMes),
        pausado: limites.pausado,
        modoLeitura: limites.pausado || tetoAtingido || !limites.geracaoDisponivel,
      },
    };
  }

  // --- Internos ---

  /** A execução que está rodando agora: a deste processo ou a de outra instância (deploy sobreposto). */
  private async andamento(): Promise<{ id: string; tipo: TipoExecucao } | null> {
    if (this.emCurso) return { id: this.emCurso.id, tipo: this.emCurso.tipo };
    const noBanco = await this.config.repo.execucaoEmAndamento();
    return noBanco ? { id: noBanco.id, tipo: noBanco.tipo } : null;
  }

  private async custoDiarioUsd(): Promise<number> {
    const media = await this.config.repo.custoMedioDiarioUsd(EXECUCOES_NA_MEDIA);
    return media !== null && media > 0 ? media : CUSTO_DIARIO_PADRAO_USD;
  }

  private recusa(
    motivo: MotivoDeRecusa,
    tentarEm: string | null = null,
    mensagemPropria?: string,
  ): ResultadoDoPedido {
    const { limites } = this.config;
    const mensagens: Record<MotivoDeRecusa, string> = {
      sem_chave:
        "O servidor está sem a chave da Anthropic e só consegue mostrar o que já foi gerado.",
      pausado: "Os gastos estão pausados (GASTOS_PAUSADOS). O app mostra o último briefing.",
      limite_diario: `Você já usou as ${limites.atualizacoesPorDia} atualizações de hoje. Elas voltam à meia-noite.`,
      intervalo: `Espere ${limites.intervaloEntreAtualizacoesMin} minutos entre uma atualização e outra.`,
      teto_mensal: `O teto de ${usd(limites.maxUsdMes)} do mês foi atingido. O app mostra o último briefing até o mês virar.`,
      reserva: "Atualizar agora invadiria a verba dos briefings diários que faltam no mês.",
    };
    return {
      situacao: "recusada",
      motivo,
      mensagem: mensagemPropria ?? mensagens[motivo],
      tentarEm,
    };
  }

  /**
   * Começa a execução e só responde quando ela existe no banco (assim o id devolvido já pode ser
   * consultado). O trabalho pesado continua em segundo plano.
   */
  private async partir(tipo: TipoExecucao, reservaUsd: number): Promise<ResultadoDoPedido> {
    const { executar, log, repo } = this.config;
    const id = (this.config.gerarId ?? randomUUID)();

    let criada!: () => void;
    const existe = new Promise<void>((resolve) => {
      criada = resolve;
    });
    const trabalho = executar(tipo, { gerarId: () => id, aoIniciar: () => criada(), reservaUsd });

    const fim = trabalho.then(
      (resultado) => {
        log.info(
          `Execução ${tipo} ${id.slice(0, 8)} terminou: ${resultado.status} (US$ ${resultado.gastoUsd.toFixed(4)}).`,
        );
      },
      async (erro: unknown) => {
        if (erro instanceof ExecucaoEmAndamento) return;
        log.erro(
          `Execução ${tipo} ${id.slice(0, 8)} quebrou: ${erro instanceof Error ? erro.message : String(erro)}`,
        );
        // Se já existia no banco, não pode ficar 'rodando' para sempre.
        try {
          await repo.atualizarStatus(id, "falhou");
        } catch {
          /* a execução nem chegou a ser criada */
        }
      },
    );
    this.emCurso = {
      id,
      tipo,
      fim: fim.finally(() => {
        if (this.emCurso?.id === id) this.emCurso = null;
      }),
    };

    try {
      await Promise.race([existe, trabalho.then(() => undefined)]);
    } catch (erro) {
      // O pipeline caiu antes de a execução existir.
      this.emCurso = null;
      if (erro instanceof ExecucaoEmAndamento) {
        const outra = await repo.execucaoEmAndamento();
        if (outra) return { situacao: "em_andamento", execucaoId: outra.id };
      }
      throw erro;
    }
    return { situacao: "iniciada", execucaoId: id };
  }
}
