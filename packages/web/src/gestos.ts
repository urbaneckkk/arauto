export interface Ponto {
  x: number;
  y: number;
  /** Instante em ms. */
  t: number;
}

export type Gesto = "anterior" | "proximo" | null;

const DISTANCIA_DE_ARRASTE = 50;
const TOLERANCIA_DE_TOQUE = 10;
const DURACAO_MAXIMA_DE_TOQUE_MS = 500;
const FRACAO_DA_ESQUERDA = 0.3;

/**
 * Traduz o dedo em ação nos Stories: arrastar para a esquerda avança, para a direita volta;
 * um toque curto no começo da tela volta, no resto avança. Rolar o texto na vertical não conta.
 */
export function interpretarGesto(inicio: Ponto, fim: Ponto, largura: number): Gesto {
  const dx = fim.x - inicio.x;
  const dy = fim.y - inicio.y;
  if (Math.abs(dx) > DISTANCIA_DE_ARRASTE && Math.abs(dx) > Math.abs(dy) * 1.5) {
    return dx < 0 ? "proximo" : "anterior";
  }
  if (Math.hypot(dx, dy) < TOLERANCIA_DE_TOQUE && fim.t - inicio.t < DURACAO_MAXIMA_DE_TOQUE_MS) {
    return inicio.x < largura * FRACAO_DA_ESQUERDA ? "anterior" : "proximo";
  }
  return null;
}
