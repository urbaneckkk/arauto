import type { Briefing, Noticia, SecaoId } from "@arauto/core";

export const FUSO = "America/Sao_Paulo";
const PALAVRAS_POR_MINUTO = 220;

/** AAAA-MM-DD de hoje em São Paulo (a mesma "data" do briefing). */
export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

/** "2026-11-05" → "05/11/2026". */
export function dataBr(iso: string): string {
  return iso.split("-").reverse().join("/");
}

/** "2026-11-05" → "quinta-feira, 5 de novembro". */
export function dataPorExtenso(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${iso}T12:00:00-03:00`));
}

/** Instante ISO → "09:30" em São Paulo. */
export function horaBr(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** Instante ISO → "05/11 09:30" em São Paulo. */
export function dataHoraBr(iso: string): string {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const v = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${v("day")}/${v("month")} ${v("hour")}:${v("minute")}`;
}

export type RotuloDeSecao = SecaoId | "curiosidade";

export const NOMES_DE_SECAO: Record<RotuloDeSecao, string> = {
  politica: "Política",
  economia: "Economia",
  agro: "Agro",
  tecnologia: "Tecnologia",
  seguranca_saude: "Segurança e saúde",
  parana: "Paraná",
  mundo: "Mundo",
  curiosidade: "Curiosidade",
};

const VEICULOS: [RegExp, string][] = [
  [/(^|\.)g1\.globo\.com$/, "g1"],
  [/(^|\.)valor\.globo\.com$/, "Valor"],
  [/(^|\.)globorural\.globo\.com$/, "Globo Rural"],
  [/(^|\.)folha\.uol\.com\.br$/, "Folha"],
  [/(^|\.)estadao\.com\.br$/, "Estadão"],
  [/(^|\.)agenciabrasil\.ebc\.com\.br$/, "Agência Brasil"],
  [/(^|\.)bbc\.(com|co\.uk)$/, "BBC"],
  [/(^|\.)gazetadopovo\.com\.br$/, "Gazeta do Povo"],
  [/(^|\.)bandab\.com\.br$/, "Banda B"],
  [/(^|\.)bemparana\.com\.br$/, "Bem Paraná"],
  [/(^|\.)tribunapr\.com\.br$/, "Tribuna"],
  [/(^|\.)cbncuritiba\.com\.br$/, "CBN Curitiba"],
  [/(^|\.)reuters\.com$/, "Reuters"],
  [/(^|\.)apnews\.com$/, "AP"],
  [/(^|\.)inmet\.gov\.br$/, "INMET"],
  [/(^|\.)simepar\.br$/, "Simepar"],
];

/** Nome do veículo a partir do endereço da fonte. */
export function veiculoDe(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return VEICULOS.find(([padrao]) => padrao.test(host))?.[1] ?? host.replace(/^www\./, "");
  } catch {
    return "fonte";
  }
}

function palavras(texto: string): number {
  return texto.split(/\s+/).filter((p) => /[\p{L}\p{N}]/u.test(p)).length;
}

function textosDaNoticia(n: Noticia): string[] {
  return [
    n.titulo,
    n.oQueAconteceu,
    n.porQueImporta,
    ...n.lados.map((l) => `${l.quem}: ${l.posicao}`),
    ...(n.continuaDeOntem ? [n.continuaDeOntem] : []),
  ];
}

/** Minutos de leitura (mesma conta do servidor: 220 palavras por minuto). */
export function minutosDeLeitura(b: Briefing): number {
  const textos = [
    b.historiaDoDia.titulo,
    b.historiaDoDia.resumo,
    ...b.emTrintaSegundos,
    b.tempo.resumo,
    ...b.secoes.flatMap((s) => s.noticias.flatMap(textosDaNoticia)),
    ...(b.curiosidade ? textosDaNoticia(b.curiosidade) : []),
  ];
  const total = textos.reduce((soma, t) => soma + palavras(t), 0);
  return Math.max(1, Math.round(total / PALAVRAS_POR_MINUTO));
}

export function todasAsNoticias(b: Briefing): { rotulo: RotuloDeSecao; noticia: Noticia }[] {
  return [
    ...b.secoes.flatMap((s) =>
      s.noticias.map((noticia) => ({ rotulo: s.id as RotuloDeSecao, noticia })),
    ),
    ...(b.curiosidade ? [{ rotulo: "curiosidade" as const, noticia: b.curiosidade }] : []),
  ];
}
