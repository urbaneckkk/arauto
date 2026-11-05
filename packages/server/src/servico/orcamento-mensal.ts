import { diasRestantesDepoisDe } from "./calendario.js";

/**
 * Custo central de um briefing diário (PLAN.md, seção 3.1), usado enquanto não há execuções reais
 * para tirar a média. Depois da primeira semana real, a média medida passa a valer.
 */
export const CUSTO_DIARIO_PADRAO_USD = 0.5;
/** Quantas execuções diárias bem-sucedidas entram na média. */
export const EXECUCOES_NA_MEDIA = 7;

/**
 * Verba que as atualizações sob demanda NÃO podem tocar: a dos briefings diários que ainda vão
 * rodar neste mês (PLAN.md, seção 2.6). Conta os dias que faltam e, se o de hoje ainda não saiu,
 * o de hoje também.
 */
export function calcularReservaUsd(opcoes: {
  hoje: string;
  briefingDeHojeJaGerado: boolean;
  custoDiarioUsd: number;
}): number {
  const dias = diasRestantesDepoisDe(opcoes.hoje) + (opcoes.briefingDeHojeJaGerado ? 0 : 1);
  return Math.round(dias * opcoes.custoDiarioUsd * 1_000_000) / 1_000_000;
}

/** Aviso de gasto a 50%, 80% e 100% do teto (PLAN.md, seção 2.8, item 9). */
export type NivelDeGasto = 0 | 50 | 80 | 100;

export function nivelDeGasto(gastoUsd: number, tetoUsd: number): NivelDeGasto {
  const fracao = gastoUsd / tetoUsd;
  if (fracao >= 1) return 100;
  if (fracao >= 0.8) return 80;
  if (fracao >= 0.5) return 50;
  return 0;
}
