import type { Briefing, Noticia } from "@arauto/core";
import { contarPalavras } from "../util/texto.js";

/** Palavras por minuto usadas para estimar o tempo de leitura (PLAN.md, seção 0.1, item 9). */
export const PALAVRAS_POR_MINUTO = 220;

export interface Leitura {
  palavras: number;
  minutos: number;
}

function textosDaNoticia(noticia: Noticia): string[] {
  return [
    noticia.titulo,
    noticia.oQueAconteceu,
    noticia.porQueImporta,
    ...noticia.lados.map((lado) => `${lado.quem}: ${lado.posicao}`),
    ...(noticia.continuaDeOntem ? [noticia.continuaDeOntem] : []),
  ];
}

/** Conta só o que a pessoa lê: títulos e textos. Fontes, links e números do tempo ficam de fora. */
export function medirLeitura(briefing: Briefing): Leitura {
  const textos = [
    briefing.historiaDoDia.titulo,
    briefing.historiaDoDia.resumo,
    ...briefing.emTrintaSegundos,
    briefing.tempo.resumo,
    ...briefing.secoes.flatMap((secao) => secao.noticias.flatMap(textosDaNoticia)),
    ...(briefing.curiosidade ? textosDaNoticia(briefing.curiosidade) : []),
  ];
  const palavras = textos.reduce((soma, texto) => soma + contarPalavras(texto), 0);
  return { palavras, minutos: Math.round((palavras / PALAVRAS_POR_MINUTO) * 10) / 10 };
}
