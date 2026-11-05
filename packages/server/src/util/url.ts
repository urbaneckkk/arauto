const PARAMETROS_DE_RASTREIO =
  /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|ref|ref_src|cmpid|origin)$/i;

/**
 * Forma única de uma URL: só http/https, https sempre, host em minúsculas, sem fragmento
 * e sem parâmetros de rastreio. Devolve null se não for uma URL web válida.
 */
export function urlCanonica(url: string): string | null {
  let analisada: URL;
  try {
    analisada = new URL(url.trim());
  } catch {
    return null;
  }
  if (analisada.protocol !== "http:" && analisada.protocol !== "https:") return null;
  analisada.protocol = "https:";
  analisada.hash = "";
  if (analisada.port === "443" || analisada.port === "80") analisada.port = "";
  for (const chave of [...analisada.searchParams.keys()]) {
    if (PARAMETROS_DE_RASTREIO.test(chave)) analisada.searchParams.delete(chave);
  }
  return analisada.toString();
}

export function hostDe(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** O host é um dos domínios da lista, ou subdomínio de um deles? */
export function pertenceAoDominio(host: string, dominios: readonly string[]): boolean {
  const minusculo = host.toLowerCase();
  return dominios.some((dominio) => minusculo === dominio || minusculo.endsWith(`.${dominio}`));
}
