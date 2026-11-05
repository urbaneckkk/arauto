import type { ControleDeOuvir } from "./ouvir";

/** Controle do modo Ouvir: aparece embaixo, por cima das telas, enquanto o briefing é lido em voz alta. */
export function BarraOuvir({
  controle,
  aoFechar,
}: {
  controle: ControleDeOuvir;
  aoFechar: () => void;
}) {
  return (
    <section className="barra-ouvir" aria-label="Ouvir o briefing">
      <div className="barra-ouvir-texto">
        <span className="rotulo">
          Ouvindo · {Math.min(controle.indice + 1, controle.total)} de {controle.total}
        </span>
        <span className="barra-ouvir-titulo">{controle.rotulo}</span>
      </div>
      <div className="barra-ouvir-botoes">
        <button type="button" onClick={controle.anterior} aria-label="Trecho anterior">
          ⏮
        </button>
        {controle.tocando ? (
          <button type="button" className="principal" onClick={controle.pausar} aria-label="Pausar">
            ⏸
          </button>
        ) : (
          <button
            type="button"
            className="principal"
            onClick={controle.continuar}
            aria-label="Continuar"
          >
            ▶
          </button>
        )}
        <button type="button" onClick={controle.proximo} aria-label="Próximo trecho">
          ⏭
        </button>
        <button
          type="button"
          onClick={() => {
            controle.parar();
            aoFechar();
          }}
          aria-label="Parar de ouvir"
        >
          ✕
        </button>
      </div>
    </section>
  );
}
