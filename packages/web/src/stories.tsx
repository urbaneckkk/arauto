import type { Briefing, TemaId } from "@arauto/core";
import { type PointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { interpretarGesto, type Ponto } from "./gestos";
import { EmTrintaSegundos, NoticiaView, TempoView } from "./leitura";
import { Nucleo } from "./nucleo";
import { salvarPrefs } from "./prefs";
import { hrefDe } from "./rotas";
import { TEMAS } from "./temas";
import { dataPorExtenso, horaBr, todasAsNoticias } from "./util";

interface Props {
  briefing: Briefing;
  tema: TemaId;
  minutos: number;
  criadoEm: string;
  podeOuvir: boolean;
  aoOuvir: () => void;
  /** Sem rolagem para o histórico quando o briefing é de outro dia. */
  hoje: boolean;
}

interface Slide {
  chave: string;
  conteudo: ReactNode;
}

/** Stories: um assunto por tela. Toque, arraste ou use as setas do teclado. Não passa sozinho. */
export function Stories({ briefing, tema, minutos, criadoEm, podeOuvir, aoOuvir, hoje }: Props) {
  const [posicao, setPosicao] = useState(0);
  const inicio = useRef<Ponto | null>(null);
  const info = TEMAS[tema];

  const slides = useMemo<Slide[]>(() => {
    const lista: Slide[] = [
      {
        chave: "capa",
        conteudo: (
          <div className="capa">
            <div className="fita" aria-hidden="true" />
            <div className="capa-nucleo">
              <Nucleo tema={tema} titulo={info.nome} />
            </div>
            {tema !== "luto" && <p className="rotulo">{info.nome}</p>}
            <h1 className="manchete grande">{briefing.historiaDoDia.titulo}</h1>
            <p className="corpo suave">{briefing.historiaDoDia.resumo}</p>
            <p className="meta">
              {dataPorExtenso(briefing.data)} · leitura de {minutos} min
            </p>
            {podeOuvir && (
              <button type="button" className="botao" onClick={aoOuvir}>
                ▶ Ouvir
              </button>
            )}
            <p className="dica">Toque para pular</p>
          </div>
        ),
      },
      { chave: "trinta", conteudo: <EmTrintaSegundos pontos={briefing.emTrintaSegundos} /> },
      { chave: "tempo", conteudo: <TempoView tempo={briefing.tempo} /> },
      ...todasAsNoticias(briefing).map(({ rotulo, noticia }) => ({
        chave: `${rotulo}:${noticia.titulo}`,
        conteudo: <NoticiaView noticia={noticia} rotulo={rotulo} />,
      })),
      {
        chave: "fim",
        conteudo: (
          <div className="fim">
            <p className="rotulo">Fim</p>
            <h2 className="manchete">Isso foi tudo por hoje.</h2>
            <p className="corpo suave">
              Briefing gerado às {horaBr(criadoEm)}. Visual escolhido porque: {briefing.tema.motivo}
            </p>
            <div className="acoes">
              {podeOuvir && (
                <button type="button" className="botao" onClick={aoOuvir}>
                  ▶ Ouvir tudo
                </button>
              )}
              <button
                type="button"
                className="botao secundario"
                onClick={() => salvarPrefs({ modo: "lista" })}
              >
                Ver em lista
              </button>
              <a className="botao secundario" href={hrefDe({ nome: "historico" })}>
                Dias anteriores
              </a>
              {!hoje && (
                <a className="botao secundario" href={hrefDe({ nome: "hoje" })}>
                  Voltar para hoje
                </a>
              )}
            </div>
          </div>
        ),
      },
    ];
    return lista;
  }, [briefing, tema, info.nome, minutos, criadoEm, podeOuvir, aoOuvir, hoje]);

  const ultimo = slides.length - 1;
  const ir = (delta: 1 | -1) => setPosicao((p) => Math.min(ultimo, Math.max(0, p + delta)));

  // Se o briefing mudar (atualização), volta ao começo em vez de ficar num número que não existe mais.
  const identidade = `${briefing.data}:${slides.length}`;
  const [anterior, setAnterior] = useState(identidade);
  if (anterior !== identidade) {
    setAnterior(identidade);
    setPosicao(0);
  }

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo?.closest("input, select, textarea, [contenteditable]")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") ir(1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") ir(-1);
      else if (e.key === " " && !alvo?.closest("a, button")) {
        e.preventDefault();
        ir(1);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  const aoApertar = (e: PointerEvent<HTMLElement>) => {
    inicio.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
  };
  const aoSoltar = (e: PointerEvent<HTMLElement>) => {
    const comeco = inicio.current;
    inicio.current = null;
    if (!comeco) return;
    if ((e.target as HTMLElement).closest("a, button")) return;
    const largura = e.currentTarget.getBoundingClientRect().width;
    const gesto = interpretarGesto(comeco, { x: e.clientX, y: e.clientY, t: e.timeStamp }, largura);
    if (gesto === "proximo") ir(1);
    else if (gesto === "anterior") ir(-1);
  };
  const atual = slides[Math.min(posicao, ultimo)];

  return (
    <section className="stories" aria-roledescription="carrossel" aria-label="Briefing do dia">
      <div
        className="progresso"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={slides.length}
        aria-valuenow={posicao + 1}
      >
        {slides.map((s, n) => (
          <span key={s.chave} className={n <= posicao ? "feito" : ""} />
        ))}
      </div>
      <div className="slide-area" aria-live="polite">
        {/* O gesto (toque/arrasto) é um atalho a mais: os botões e o teclado fazem o mesmo. */}
        <div role="presentation" className="gesto" onPointerDown={aoApertar} onPointerUp={aoSoltar}>
          <div className="slide" key={atual?.chave}>
            {atual?.conteudo}
          </div>
        </div>
      </div>
      <nav className="stories-nav" aria-label="Navegar pelo briefing">
        <button type="button" onClick={() => ir(-1)} disabled={posicao === 0} aria-label="Anterior">
          ‹
        </button>
        <span>
          {posicao + 1} / {slides.length}
        </span>
        <button
          type="button"
          onClick={() => ir(1)}
          disabled={posicao === ultimo}
          aria-label="Próximo"
        >
          ›
        </button>
      </nav>
    </section>
  );
}
