import { dataEmSaoPaulo, FUSO, isoDeSaoPaulo } from "../util/tempo.js";

/** O briefing começa às 06:00 para ficar pronto às 06:30 (briefing, "Pipeline"). */
export const MINUTO_DE_INICIO_DO_BRIEFING = 6 * 60;
/** Passou das 06:40 sem briefing do dia: está atrasado (PLAN.md, Q6). */
export const MINUTO_DE_ATRASO = 6 * 60 + 40;

/** Minutos desde a meia-noite, no horário de São Paulo. */
export function minutosDoDiaEmSaoPaulo(instante: Date): number {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: FUSO,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instante);
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  return valor("hour") * 60 + valor("minute");
}

/** O instante em que o próximo dia (de São Paulo) começa. */
export function inicioDoProximoDia(instante: Date): string {
  const hoje = dataEmSaoPaulo(instante);
  // Meio-dia de hoje + 24 h cai sempre no meio-dia de amanhã, qualquer que seja o fuso.
  const amanha = dataEmSaoPaulo(new Date(Date.parse(isoDeSaoPaulo(hoje, "12:00")) + 86_400_000));
  return isoDeSaoPaulo(amanha, "00:00");
}

/** Quantos dias do mês ainda virão depois de `data` (AAAA-MM-DD). */
export function diasRestantesDepoisDe(data: string): number {
  const [ano, mes, dia] = data.split("-").map(Number) as [number, number, number];
  const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return diasNoMes - dia;
}
