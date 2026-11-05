/**
 * Tabela de preços EM CÓDIGO, com data, para o custo gravado ser reproduzível (PLAN.md, 2.6).
 * Fonte: tabela de modelos do skill da API Claude, cache de 06/10/2026. Conferir no console da
 * Anthropic antes de confiar nos totais; se um preço mudar, atualize aqui e a data abaixo.
 */
export const PRECOS_VERSAO = "2026-10-06";

export interface PrecoDoModelo {
  /** Dólares por milhão de tokens. */
  entrada: number;
  saida: number;
  /** Leitura de cache: 10% da entrada (regra geral da API). */
  leituraDeCache: number;
  /** Prompts acima deste tamanho (tokens) usam a segunda faixa de preço, se houver. */
  limiteDaFaixa?: number;
  entradaAcima?: number;
  saidaAcima?: number;
}

export const PRECOS: Record<string, PrecoDoModelo> = {
  "claude-haiku-5-5": {
    entrada: 0.1,
    saida: 0.5,
    leituraDeCache: 0.01,
    limiteDaFaixa: 100_000,
    entradaAcima: 0.5,
    saidaAcima: 2.5,
  },
  "claude-sonnet-5-5": { entrada: 2, saida: 10, leituraDeCache: 0.2 },
};

/** Busca web da Anthropic: US$ 10 por 1.000 buscas, mais os tokens. */
export const USD_POR_BUSCA = 0.01;

export class ModeloSemPreco extends Error {
  constructor(modelo: string) {
    super(
      `Sem preço cadastrado para o modelo "${modelo}" em custo/precos.ts. Cadastre antes de usar.`,
    );
    this.name = "ModeloSemPreco";
  }
}

export interface UsoBruto {
  tokensEntrada: number;
  tokensSaida: number;
  tokensCacheLeitura: number;
  buscas: number;
}

function precoDe(modelo: string): PrecoDoModelo {
  const preco = PRECOS[modelo];
  if (!preco) throw new ModeloSemPreco(modelo);
  return preco;
}

function arredondar(usd: number): number {
  return Math.round(usd * 1_000_000) / 1_000_000;
}

export function calcularUsd(modelo: string, uso: UsoBruto): number {
  const preco = precoDe(modelo);
  const prompt = uso.tokensEntrada + uso.tokensCacheLeitura;
  const acima = preco.limiteDaFaixa !== undefined && prompt > preco.limiteDaFaixa;
  const entrada = acima ? (preco.entradaAcima ?? preco.entrada) : preco.entrada;
  const saida = acima ? (preco.saidaAcima ?? preco.saida) : preco.saida;
  const usd =
    (uso.tokensEntrada * entrada +
      uso.tokensSaida * saida +
      uso.tokensCacheLeitura * preco.leituraDeCache) /
      1_000_000 +
    uso.buscas * USD_POR_BUSCA;
  return arredondar(usd);
}

/** Estimativa grosseira de tokens de um texto em português: ~3 caracteres por token (para cima). */
export function estimarTokens(texto: string): number {
  return Math.ceil(texto.length / 3);
}

/** O mais que uma chamada pode custar: entrada estimada, saída no máximo e todas as buscas. */
export function estimarPiorCasoUsd(
  modelo: string,
  tokensEntradaEstimados: number,
  maxTokensSaida: number,
  maxBuscas: number,
): number {
  return calcularUsd(modelo, {
    tokensEntrada: tokensEntradaEstimados,
    tokensSaida: maxTokensSaida,
    tokensCacheLeitura: 0,
    buscas: maxBuscas,
  });
}
