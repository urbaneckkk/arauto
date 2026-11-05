import { UMA_HORA_MS } from "../util/tempo.js";

/**
 * Pontuação de um acontecimento (briefing, passo 2): feita por CÓDIGO, não pelo modelo.
 * Os pesos e as referências são PROVISÓRIOS: calibrar com dados reais (PLAN.md, seção 2.3).
 *
 * Com GDELT: veículos distintos, países distintos, recência e volume.
 * Sem GDELT (o caso comum, porque ele falha muito): só veículos do RSS e recência.
 */
export const PESOS_COM_GDELT = { veiculos: 0.35, paises: 0.25, recencia: 0.15, volume: 0.25 };
export const PESOS_SEM_GDELT = { veiculos: 0.6, recencia: 0.4 };

/** Quantos veículos e países distintos valem nota máxima. */
export const REFERENCIA_VEICULOS_GDELT = 30;
export const REFERENCIA_PAISES_GDELT = 15;
export const REFERENCIA_ARTIGOS_GDELT = 250;
/** Só o RSS da lista branca: ~20 veículos no total, então 8 já é cobertura ampla. */
export const REFERENCIA_VEICULOS_RSS = 8;

const limitar = (valor: number) => Math.min(1, Math.max(0, valor));
const arredondar = (valor: number) => Math.round(valor * 1000) / 1000;

/** Média de "frescor" dos itens: 1 = acabou de sair, 0 = 36 horas ou mais. */
export function recencia(publicacoes: readonly string[], agora: Date, janelaHoras = 36): number {
  if (publicacoes.length === 0) return 0;
  const soma = publicacoes.reduce((total, iso) => {
    const idade = (agora.getTime() - Date.parse(iso)) / UMA_HORA_MS;
    return total + limitar(1 - idade / janelaHoras);
  }, 0);
  return arredondar(soma / publicacoes.length);
}

export function pontuarSemGdelt(entrada: { veiculos: number; recencia: number }): number {
  const veiculos = limitar(entrada.veiculos / REFERENCIA_VEICULOS_RSS);
  return arredondar(
    PESOS_SEM_GDELT.veiculos * veiculos + PESOS_SEM_GDELT.recencia * entrada.recencia,
  );
}

export function pontuarComGdelt(entrada: {
  veiculos: number;
  paises: number;
  recencia: number;
  artigos: number;
}): number {
  const veiculos = limitar(entrada.veiculos / REFERENCIA_VEICULOS_GDELT);
  const paises = limitar(entrada.paises / REFERENCIA_PAISES_GDELT);
  const volume = limitar(Math.log(1 + entrada.artigos) / Math.log(1 + REFERENCIA_ARTIGOS_GDELT));
  return arredondar(
    PESOS_COM_GDELT.veiculos * veiculos +
      PESOS_COM_GDELT.paises * paises +
      PESOS_COM_GDELT.recencia * entrada.recencia +
      PESOS_COM_GDELT.volume * volume,
  );
}
