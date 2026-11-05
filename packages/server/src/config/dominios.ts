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
