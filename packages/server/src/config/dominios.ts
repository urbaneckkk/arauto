/**
 * Lista branca de domínios (briefing: "RSS de uma lista branca" e "só domínios da lista branca").
 * Toda fonte citada no briefing precisa pertencer a um destes domínios (ou subdomínio deles).
 *
 * Acréscimos em relação ao briefing, para cobrir o que ele pede (agro, Paraná):
 * globorural.globo.com e os veículos locais do Paraná listados abaixo.
 */
export const DOMINIOS_PERMITIDOS = [
  // Brasil
  "agenciabrasil.ebc.com.br",
  "g1.globo.com",
  "valor.globo.com",
  "globorural.globo.com",
  "folha.uol.com.br",
  "estadao.com.br",
  // Mundo
  "bbc.com",
  "bbc.co.uk",
  "reuters.com",
  "apnews.com",
  // Paraná e Curitiba
  "gazetadopovo.com.br",
  "bandab.com.br",
  "plural.jor.br",
  "bemparana.com.br",
  "tribunapr.com.br",
  "cbncuritiba.com.br",
  "aen.pr.gov.br",
  "defesacivil.pr.gov.br",
  "simepar.br",
  // Alertas
  "inmet.gov.br",
] as const;

/**
 * Domínios que o rastreador da Anthropic NÃO consegue acessar: a busca web recusa a chamada
 * inteira (HTTP 400, "not accessible to our user agent") se algum deles estiver em
 * `allowed_domains`. Descoberto na 1ª execução real (04/11/2026). Seguem na lista branca porque
 * podem aparecer como fonte (BBC e Estadão têm RSS), mas não entram na busca. Reuters e AP não
 * têm RSS nem busca: não há como obtê-los hoje.
 */
export const DOMINIOS_BLOQUEADOS_PARA_BUSCA = [
  "apnews.com",
  "bbc.co.uk",
  "bbc.com",
  "estadao.com.br",
  "reuters.com",
] as const;

/** Domínios que a busca web pode usar: a lista branca menos os que bloqueiam o rastreador. */
export const DOMINIOS_PARA_BUSCA: readonly string[] = DOMINIOS_PERMITIDOS.filter(
  (dominio) => !(DOMINIOS_BLOQUEADOS_PARA_BUSCA as readonly string[]).includes(dominio),
);

/**
 * Domínios de redirecionamento dos próprios veículos. Os feeds da Folha, por exemplo, trazem
 * links `redir.folha.com.br/...` que levam à matéria. Só valem como ponto de passagem: a URL
 * FINAL, depois do redirecionamento, é que precisa estar em DOMINIOS_PERMITIDOS.
 */
export const DOMINIOS_DE_REDIRECIONAMENTO = ["redir.folha.com.br"] as const;

/**
 * Domínios que respondem 401/403 a scripts (testado em 04/11/2026). Para eles, uma resposta
 * dessas conta como "inconclusiva" e a fonte só passa se a proveniência estiver provada
 * (PLAN.md, seção 2.4).
 */
export const DOMINIOS_QUE_BLOQUEIAM_SCRIPT = ["reuters.com", "apnews.com", "simepar.br"] as const;
