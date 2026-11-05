import type { CSSProperties } from "react";

const QUANTIDADE = { 1: 6, 2: 12, 3: 20 } as const;
const PHI = 0.6180339887;

function frac(n: number): number {
  return n - Math.floor(n);
}

interface Props {
  intensidade: 1 | 2 | 3;
}

/**
 * Camada de movimento ao fundo. A posição de cada elemento sai de uma conta fixa (sem Math.random),
 * então a tela não "pula" quando o React redesenha. Como cada tema anima é decidido em temas.css.
 */
export function Ambiente({ intensidade }: Props) {
  const total = QUANTIDADE[intensidade];
  const itens = Array.from({ length: total }, (_, n) => n);
  return (
    <div
      className="ambiente"
      style={{ "--forca": intensidade } as CSSProperties}
      aria-hidden="true"
    >
      {itens.map((n) => (
        <i
          key={n}
          style={
            {
              "--x": `${Math.round(frac((n + 1) * PHI) * 100)}%`,
              "--y": `${Math.round(frac((n + 1) * PHI * 1.7 + 0.2) * 100)}%`,
              "--d": `${-Math.round(frac((n + 1) * PHI * 3.1) * 90) / 10}s`,
              "--t": `${6 + Math.round(frac((n + 1) * PHI * 2.3) * 70) / 10}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
