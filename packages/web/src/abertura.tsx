import type { TemaId } from "@arauto/core";
import { type CSSProperties, useEffect } from "react";
import { Nucleo } from "./nucleo";
import { TEMAS } from "./temas";

interface Props {
  tema: TemaId;
  aoTerminar: () => void;
}

/**
 * Abertura de 1,5 a 2,5 s, com o símbolo do tema. Um toque (ou Esc, ou Enter) pula.
 * No tema luto só há um fade, sem movimento; quem pede menos movimento também só vê o fade
 * (as regras estão em temas.css e estilos.css).
 */
export function Abertura({ tema, aoTerminar }: Props) {
  const info = TEMAS[tema];

  useEffect(() => {
    const prazo = window.setTimeout(aoTerminar, info.aberturaMs);
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoTerminar();
    };
    window.addEventListener("keydown", tecla);
    return () => {
      window.clearTimeout(prazo);
      window.removeEventListener("keydown", tecla);
    };
  }, [info.aberturaMs, aoTerminar]);

  return (
    <button
      type="button"
      className="abertura"
      data-tema={tema}
      style={{ "--duracao": `${info.aberturaMs}ms` } as CSSProperties}
      onClick={aoTerminar}
      aria-label={`Abrindo o briefing. Tema ${info.nome}. Toque para pular.`}
    >
      <span className="abertura-miolo">
        <span className="abertura-nucleo">
          <Nucleo tema={tema} />
        </span>
        <span className="abertura-marca">ARAUTO</span>
        {tema !== "luto" && <span className="abertura-nome">{info.nome}</span>}
      </span>
    </button>
  );
}
