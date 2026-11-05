import type {
  OpcoesHttp,
  RespostaHttp,
  ResultadoDaVerificacao,
  Transporte,
} from "../src/infra/transporte.js";

export type RespostaDeTeste = RespostaHttp | Error;

export function ok(corpo: string, contentType = "application/xml"): RespostaHttp {
  return { status: 200, contentType, corpo };
}

/** Resposta de `verificar` por URL: só o código, ou código e URL final (redirecionamento). */
export type VerificacaoDeTeste = number | { status: number; urlFinal?: string };

/**
 * Transporte de mentira: devolve o que está no mapa e anota as chamadas.
 * `get` de URL fora do mapa dá erro de rede; `verificar` de URL fora do mapa dá 200 sem redirecionamento.
 */
export function transporteDeMapa(
  mapa: Record<string, RespostaDeTeste>,
  verificacoes: Record<string, VerificacaoDeTeste> = {},
): Transporte & { chamadas: string[] } {
  const chamadas: string[] = [];
  return {
    chamadas,
    async get(url: string, _opcoes?: OpcoesHttp) {
      chamadas.push(url);
      const resposta = mapa[url];
      if (resposta === undefined) throw new Error(`rede: sem resposta de teste para ${url}`);
      if (resposta instanceof Error) throw resposta;
      return resposta;
    },
    async verificar(url: string): Promise<ResultadoDaVerificacao> {
      chamadas.push(`verificar ${url}`);
      const v = verificacoes[url] ?? 200;
      return typeof v === "number"
        ? { status: v, urlFinal: url }
        : { status: v.status, urlFinal: v.urlFinal ?? url };
    },
  };
}

/** RSS 2.0 sintético. Todo o conteúdo é inventado. */
export function rss(
  itens: { titulo: string; url: string; data?: string; resumo?: string }[],
): string {
  const corpo = itens
    .map(
      (item) =>
        `<item><title>${item.titulo}</title><link>${item.url}</link>` +
        (item.data ? `<pubDate>${item.data}</pubDate>` : "") +
        (item.resumo ? `<description>${item.resumo}</description>` : "") +
        "</item>",
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Feed de teste</title>${corpo}</channel></rss>`;
}
