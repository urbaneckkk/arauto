import type { UsoDeModelo } from "@arauto/core";

export type MotivoDeParada = "execucao" | "mes" | "reserva" | "pausado";

/** Lançado quando uma trava de custo impede a chamada. O pipeline para e avisa (briefing: "pare e me avise"). */
export class OrcamentoEsgotado extends Error {
  constructor(
    readonly motivo: MotivoDeParada,
    detalhe: string,
  ) {
    super(detalhe);
    this.name = "OrcamentoEsgotado";
  }
}

export interface ConfigDoOrcamento {
  maxExecucaoUsd: number;
  maxMesUsd: number;
  /** Quanto já foi gasto no mês antes desta execução (vem do livro-caixa). */
  gastoDoMesAntesUsd: number;
  /** Interruptor geral (GASTOS_PAUSADOS). */
  pausado: boolean;
  /**
   * Verba do mês que esta execução NÃO pode tocar: a dos briefings diários que ainda vão rodar
   * (PLAN.md, seção 2.6). Só as atualizações sob demanda usam; o briefing das 06:00 usa 0.
   */
  reservaUsd?: number;
}

const usd = (valor: number) => `US$ ${valor.toFixed(4)}`;

/**
 * Travas de custo de UMA execução: verifica ANTES de cada chamada (pelo pior caso) e registra
 * DEPOIS (pelo uso real). Nunca confia só no que já foi gasto: uma chamada cara pode estourar a
 * trava sozinha.
 */
export class Orcamento {
  private gasto = 0;
  private readonly usos: UsoDeModelo[] = [];

  constructor(private readonly config: ConfigDoOrcamento) {}

  get gastoDaExecucaoUsd(): number {
    return Math.round(this.gasto * 1_000_000) / 1_000_000;
  }

  get buscasDaExecucao(): number {
    return this.usos.reduce((soma, uso) => soma + uso.buscas, 0);
  }

  get todosOsUsos(): readonly UsoDeModelo[] {
    return this.usos;
  }

  verificarAntes(piorCasoUsd: number): void {
    if (this.config.pausado) {
      throw new OrcamentoEsgotado(
        "pausado",
        "Gastos pausados (GASTOS_PAUSADOS=1): nenhuma chamada paga foi feita.",
      );
    }
    const execucao = this.gasto + piorCasoUsd;
    if (execucao > this.config.maxExecucaoUsd) {
      throw new OrcamentoEsgotado(
        "execucao",
        `A chamada poderia levar esta execução a ${usd(execucao)}, acima da trava de ${usd(this.config.maxExecucaoUsd)} por execução (já gasto: ${usd(this.gasto)}).`,
      );
    }
    const mes = this.config.gastoDoMesAntesUsd + execucao;
    if (mes > this.config.maxMesUsd) {
      throw new OrcamentoEsgotado(
        "mes",
        `A chamada poderia levar o mês a ${usd(mes)}, acima da trava de ${usd(this.config.maxMesUsd)} por mês (gasto antes desta execução: ${usd(this.config.gastoDoMesAntesUsd)}).`,
      );
    }
    const reserva = this.config.reservaUsd ?? 0;
    if (reserva > 0 && mes > this.config.maxMesUsd - reserva) {
      throw new OrcamentoEsgotado(
        "reserva",
        `A chamada poderia levar o mês a ${usd(mes)} e invadir a reserva de ${usd(reserva)} dos briefings diários que ainda vão rodar (trava de ${usd(this.config.maxMesUsd)}).`,
      );
    }
  }

  registrar(uso: UsoDeModelo): void {
    this.usos.push(uso);
    this.gasto += uso.usd;
  }
}
