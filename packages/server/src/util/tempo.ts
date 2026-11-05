export const FUSO = "America/Sao_Paulo";
export const UMA_HORA_MS = 3_600_000;

/** Relógio injetável: nos testes e no replay, "agora" é o instante da gravação. */
export interface Relogio {
  agora(): Date;
}

export const relogioReal: Relogio = { agora: () => new Date() };

export function relogioFixo(instante: Date): Relogio {
  return { agora: () => new Date(instante) };
}

/** AAAA-MM-DD no fuso de São Paulo (a `data` do contrato do briefing). */
export function dataEmSaoPaulo(instante: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante);
}

/** AAAA-MM no fuso de São Paulo, para o total mensal de gasto. */
export function mesEmSaoPaulo(instante: Date): string {
  return dataEmSaoPaulo(instante).slice(0, 7);
}

/** Deslocamento de São Paulo naquele instante, como "-03:00". Nunca fixo no código. */
export function offsetDeSaoPaulo(instante: Date): string {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO,
    timeZoneName: "longOffset",
  }).formatToParts(instante);
  const valor = partes.find((parte) => parte.type === "timeZoneName")?.value ?? "GMT";
  const offset = valor.replace("GMT", "");
  return offset === "" ? "+00:00" : offset;
}

/** "2026-11-04" + "09:00" (hora de São Paulo) → instante ISO com o deslocamento certo. */
export function isoDeSaoPaulo(data: string, hora: string): string {
  const meioDia = new Date(`${data}T12:00:00Z`);
  return `${data}T${hora.length === 5 ? `${hora}:00` : hora}${offsetDeSaoPaulo(meioDia)}`;
}

export function horasEntre(inicio: Date, fim: Date): number {
  return (fim.getTime() - inicio.getTime()) / UMA_HORA_MS;
}

const MS_POR_UNIDADE: Record<string, number> = {
  minute: 60_000,
  minuto: 60_000,
  hour: UMA_HORA_MS,
  hora: UMA_HORA_MS,
  day: 24 * UMA_HORA_MS,
  dia: 24 * UMA_HORA_MS,
  week: 7 * 24 * UMA_HORA_MS,
  semana: 7 * 24 * UMA_HORA_MS,
};

/**
 * Converte a "idade" que a busca web informa ("2 hours ago", "há 3 dias", "April 30, 2026")
 * em um instante ISO. Devolve null se não der para entender: sem data confiável, a fonte
 * não pode ser usada (regra das 36 horas).
 */
export function lerIdadeDaPagina(valor: string | null, agora: Date): string | null {
  if (!valor) return null;
  const texto = valor.trim().toLowerCase();
  const relativo =
    texto.match(/^(\d+)\s+(minute|hour|day|week)s?\s+ago$/) ??
    texto.match(/^há\s+(\d+)\s+(minuto|hora|dia|semana)s?$/);
  if (relativo) {
    const quantidade = Number(relativo[1]);
    const unidade = MS_POR_UNIDADE[relativo[2] ?? ""];
    if (unidade === undefined) return null;
    return new Date(agora.getTime() - quantidade * unidade).toISOString();
  }
  const absoluto = Date.parse(valor);
  return Number.isNaN(absoluto) ? null : new Date(absoluto).toISOString();
}

/** "05/11 06:30", no fuso de São Paulo, para listas legíveis no material do redator. */
export function formatarDataHora(iso: string): string {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${valor("day")}/${valor("month")} ${valor("hour")}:${valor("minute")}`;
}

/** "quinta-feira, 5 de novembro de 2026". */
export function dataPorExtenso(instante: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(instante);
}
