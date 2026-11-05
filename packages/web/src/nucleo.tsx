import type { TemaId } from "@arauto/core";
import type { ReactNode } from "react";

/**
 * "Núcleo": o símbolo de cada tema, desenhado em SVG com as cores do tema (variáveis CSS).
 * Os 9 temas do print "C · Vigia" seguem o desenho dele; os outros 6 são versões provisórias
 * no mesmo estilo (círculo com um símbolo simples).
 */
const GLIFOS: Record<TemaId, ReactNode> = {
  neutro: (
    <>
      <path
        className="traco onda"
        strokeWidth="3"
        d="M26 66 q13 -10 26 0 t26 0 t26 0 t26 0 t26 0"
      />
      <path
        className="traco onda"
        strokeWidth="3"
        d="M16 80 q13 -10 26 0 t26 0 t26 0 t26 0 t26 0 t26 0"
      />
      <path
        className="traco onda"
        strokeWidth="3"
        d="M26 94 q13 -10 26 0 t26 0 t26 0 t26 0 t26 0"
      />
    </>
  ),
  ternura_animal: (
    <g className="pata">
      <ellipse className="cheio" cx="80" cy="106" rx="29" ry="24" />
      <circle className="cheio" cx="45" cy="70" r="12" />
      <circle className="cheio" cx="66" cy="50" r="13" />
      <circle className="cheio" cx="94" cy="50" r="13" />
      <circle className="cheio" cx="115" cy="70" r="12" />
    </g>
  ),
  conflito: (
    <>
      <circle className="traco" strokeWidth="2" cx="80" cy="80" r="56" />
      <circle className="traco" strokeWidth="2" cx="80" cy="80" r="37" />
      <circle className="traco" strokeWidth="2" cx="80" cy="80" r="18" />
      <path className="traco" strokeWidth="2" d="M80 20 V140 M20 80 H140" />
      <path className="destaque varre" opacity="0.55" d="M80 80 L80 24 A56 56 0 0 0 24 80 Z" />
      <circle className="destaque" cx="80" cy="80" r="4" />
    </>
  ),
  nuclear: (
    <g className="trevo">
      {[0, 120, 240].map((giro) => (
        <path
          key={giro}
          className="cheio"
          transform={`rotate(${giro} 80 80)`}
          d="M51 29.8 A58 58 0 0 1 109 29.8 L92 59.2 A24 24 0 0 0 68 59.2 Z"
        />
      ))}
      <circle className="cheio" cx="80" cy="80" r="9" />
    </g>
  ),
  clima_extremo: (
    <>
      <g className="cheio">
        <circle cx="58" cy="74" r="22" />
        <circle cx="88" cy="62" r="28" />
        <circle cx="114" cy="80" r="19" />
        <rect x="42" y="76" width="90" height="26" rx="13" />
      </g>
      <polygon
        className="destaque raio"
        points="86,84 64,122 82,122 72,150 108,104 90,104 100,84"
      />
    </>
  ),
  mercado_alta: (
    <>
      <rect className="destaque barra" x="40" y="86" width="20" height="34" rx="3" />
      <rect className="destaque barra" x="70" y="64" width="20" height="56" rx="3" />
      <rect className="destaque barra" x="100" y="38" width="20" height="82" rx="3" />
      <path className="traco" strokeWidth="2" d="M32 126 H128" />
    </>
  ),
  mercado_queda: (
    <>
      <rect className="destaque barra" x="40" y="38" width="20" height="82" rx="3" />
      <rect className="destaque barra" x="70" y="64" width="20" height="56" rx="3" />
      <rect className="destaque barra" x="100" y="86" width="20" height="34" rx="3" />
      <path className="traco" strokeWidth="2" d="M32 126 H128" />
    </>
  ),
  ciencia_espaco: (
    <>
      <circle className="cheio" cx="80" cy="82" r="27" />
      <ellipse
        className="destaque-traco anel"
        strokeWidth="5"
        cx="80"
        cy="82"
        rx="56"
        ry="14"
        transform="rotate(-20 80 82)"
      />
      <circle className="cheio" cx="30" cy="38" r="2" />
      <circle className="cheio" cx="128" cy="30" r="1.6" />
      <circle className="cheio" cx="124" cy="128" r="2" />
    </>
  ),
  tecnologia_ia: (
    <>
      <rect className="traco" strokeWidth="3" x="48" y="48" width="64" height="64" rx="9" />
      <rect className="destaque miolo" x="66" y="66" width="28" height="28" rx="5" />
      <path
        className="traco"
        strokeWidth="3"
        d="M62 48 V32 M80 48 V30 M98 48 V32 M62 112 V128 M80 112 V130 M98 112 V128 M48 62 H32 M48 80 H30 M48 98 H32 M112 62 H128 M112 80 H130 M112 98 H128"
      />
    </>
  ),
  agro_safra: (
    <>
      <circle className="destaque sol" cx="80" cy="70" r="26" />
      <path className="traco" strokeWidth="3" d="M34 94 H126 M42 106 H118 M52 118 H108" />
    </>
  ),
  politica: (
    <>
      <polygon className="cheio" points="38,62 80,36 122,62" />
      <rect className="cheio" x="44" y="68" width="10" height="42" />
      <rect className="cheio" x="66" y="68" width="10" height="42" />
      <rect className="cheio" x="86" y="68" width="10" height="42" />
      <rect className="cheio" x="106" y="68" width="10" height="42" />
      <rect className="cheio" x="36" y="112" width="88" height="8" rx="2" />
      <rect className="cheio" x="30" y="122" width="100" height="8" rx="2" />
    </>
  ),
  saude: (
    <polyline
      className="destaque-traco ecg"
      strokeWidth="6"
      points="22,84 54,84 66,56 82,112 94,68 102,84 138,84"
    />
  ),
  esporte: (
    <g className="bola">
      <circle className="traco" strokeWidth="4" cx="80" cy="80" r="40" />
      <polygon className="cheio" points="80,60 99,74 92,97 68,97 61,74" />
      <path
        className="traco"
        strokeWidth="3"
        d="M80 60 V42 M99 74 L116 68 M92 97 L103 112 M68 97 L57 112 M61 74 L44 68"
      />
    </g>
  ),
  cultura: (
    <>
      <polygon className="destaque" opacity="0.18" points="72,10 88,10 128,150 32,150" />
      <polygon
        className="destaque estrela"
        points="80,60 87.1,78.3 106.6,79.4 91.4,91.7 96.5,110.7 80,100 63.5,110.7 68.6,91.7 53.4,79.4 72.9,78.3"
      />
    </>
  ),
  luto: <circle className="cheio" cx="80" cy="80" r="4" />,
};

interface Props {
  tema: TemaId;
  /** Texto para leitor de tela. Se faltar, o símbolo é só enfeite. */
  titulo?: string;
}

export function Nucleo({ tema, titulo }: Props) {
  return (
    <svg
      className="nucleo"
      viewBox="0 0 160 160"
      role={titulo ? "img" : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
    >
      <circle className="fundo-do-nucleo" cx="80" cy="80" r="78" />
      {GLIFOS[tema]}
    </svg>
  );
}
