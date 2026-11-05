import { XMLParser } from "fast-xml-parser";

/** Um item de feed, ainda cru: só o que os formatos RSS 2.0, RSS 1.0 e Atom têm em comum. */
export interface ItemDeFeed {
  titulo: string;
  url: string;
  /** Instante ISO, ou null se a data faltar ou não for legível. */
  data: string | null;
  /** Resumo em texto puro. */
  resumo: string;
}

const analisador = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
});

function lista<T>(valor: T | T[] | undefined | null): T[] {
  if (valor === undefined || valor === null) return [];
  return Array.isArray(valor) ? valor : [valor];
}

/** Texto de um nó XML, que pode vir como string ou como objeto com atributos. */
function texto(valor: unknown): string {
  if (typeof valor === "string") return valor;
  if (typeof valor === "number") return String(valor);
  if (valor && typeof valor === "object") {
    const nodo = (valor as Record<string, unknown>)["#text"];
    if (typeof nodo === "string" || typeof nodo === "number") return String(nodo);
  }
  return "";
}

function linkDe(valor: unknown): string {
  // Atom: <link href="..." rel="alternate"/>, possivelmente vários.
  const candidatos = lista<Record<string, unknown> | string>(
    valor as Record<string, unknown> | string | undefined,
  );
  for (const candidato of candidatos) {
    if (typeof candidato === "string") return candidato.trim();
    const rel = candidato["@_rel"];
    const href = candidato["@_href"];
    if (typeof href === "string" && (rel === undefined || rel === "alternate")) return href.trim();
  }
  const primeiro = candidatos[0];
  if (primeiro && typeof primeiro === "object") return texto(primeiro).trim();
  return "";
}

function paraIso(valor: unknown): string | null {
  const bruto = texto(valor).trim();
  if (bruto === "") return null;
  const instante = Date.parse(bruto);
  return Number.isNaN(instante) ? null : new Date(instante).toISOString();
}

/** Lê RSS 2.0, RSS 1.0 (RDF) ou Atom. Lança erro se não for XML de feed. */
export function lerFeed(xml: string): ItemDeFeed[] {
  const semBom = xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml;
  const limpo = semBom.replaceAll(String.fromCharCode(0), "");
  const raiz = analisador.parse(limpo) as Record<string, unknown>;

  const rss = raiz.rss as { channel?: { item?: unknown } } | undefined;
  const rdf = raiz["rdf:RDF"] as { item?: unknown } | undefined;
  const atom = raiz.feed as { entry?: unknown } | undefined;

  if (!rss && !rdf && !atom) throw new Error("O conteúdo não é um feed RSS ou Atom");

  const brutos = atom
    ? lista(atom.entry as Record<string, unknown> | Record<string, unknown>[])
    : lista(
        (rss?.channel?.item ?? rdf?.item) as Record<string, unknown> | Record<string, unknown>[],
      );

  return brutos.map((bruto) => ({
    titulo: texto(bruto.title),
    url: linkDe(bruto.link) || texto(bruto.guid).trim(),
    data: paraIso(bruto.pubDate ?? bruto["dc:date"] ?? bruto.published ?? bruto.updated),
    resumo: texto(bruto.description ?? bruto.summary ?? bruto["content:encoded"] ?? bruto.content),
  }));
}
