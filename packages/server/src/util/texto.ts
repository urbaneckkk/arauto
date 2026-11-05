const ENTIDADES_NOMEADAS: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Tira tags e entidades de um trecho de HTML (descrições de RSS) e junta os espaços. */
export function limparHtml(entrada: string): string {
  return entrada
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (inteira, nome: string) => {
      if (nome.startsWith("#x")) return String.fromCodePoint(Number.parseInt(nome.slice(2), 16));
      if (nome.startsWith("#")) return String.fromCodePoint(Number.parseInt(nome.slice(1), 10));
      return ENTIDADES_NOMEADAS[nome.toLowerCase()] ?? inteira;
    })
    .replace(/\s+/g, " ")
    .trim();
}

export function cortar(texto: string, maximo: number): string {
  return texto.length <= maximo ? texto : `${texto.slice(0, maximo - 1).trimEnd()}…`;
}

export function contarPalavras(texto: string): number {
  return texto.split(/\s+/).filter((palavra) => /[\p{L}\p{N}]/u.test(palavra)).length;
}
