import { z } from "zod";
import type { Transporte } from "../infra/transporte.js";

export interface CoberturaGdelt {
  /** Artigos encontrados nas últimas 24 horas (no máximo 250). */
  artigos: number;
  dominios: string[];
  paises: string[];
}

const RespostaSchema = z.object({
  articles: z
    .array(z.object({ domain: z.string().optional(), sourcecountry: z.string().optional() }))
    .default([]),
});

export function urlDoGdelt(consulta: string): string {
  return (
    "https://api.gdeltproject.org/api/v2/doc/doc" +
    `?query=${encodeURIComponent(consulta)}&mode=artlist&maxrecords=250&format=json&timespan=24h&sort=hybridrel`
  );
}

/**
 * GDELT DOC 2.0. Testado em 04/11/2026: lento (até 18 s), devolve `{}` quando não há resultado
 * e 429 se houver mais de uma chamada a cada 5 s. Por isso o GDELT é um sinal opcional.
 * Devolve null quando a consulta falha, para a pontuação seguir só com o RSS.
 */
export async function consultarGdelt(
  transporte: Transporte,
  consulta: string,
): Promise<CoberturaGdelt | null> {
  try {
    const resposta = await transporte.get(urlDoGdelt(consulta), { timeoutMs: 45_000 });
    if (resposta.status !== 200) return null;
    const corpo = resposta.corpo.trim();
    // Resposta de limite de uso é texto puro, não JSON.
    if (!corpo.startsWith("{")) return null;
    const { articles } = RespostaSchema.parse(JSON.parse(corpo));
    const dominios = new Set<string>();
    const paises = new Set<string>();
    for (const artigo of articles) {
      if (artigo.domain) dominios.add(artigo.domain.toLowerCase());
      if (artigo.sourcecountry) paises.add(artigo.sourcecountry);
    }
    return { artigos: articles.length, dominios: [...dominios], paises: [...paises] };
  } catch {
    return null;
  }
}
