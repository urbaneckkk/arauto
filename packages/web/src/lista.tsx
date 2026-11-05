import type { Briefing, TemaId } from "@arauto/core";
import { EmTrintaSegundos, NoticiaView, TempoView } from "./leitura";
import { Nucleo } from "./nucleo";
import { salvarPrefs } from "./prefs";
import { hrefDe } from "./rotas";
import { TEMAS } from "./temas";
import { dataPorExtenso, horaBr, NOMES_DE_SECAO } from "./util";

interface Props {
  briefing: Briefing;
  tema: TemaId;
  minutos: number;
  criadoEm: string;
  podeOuvir: boolean;
  aoOuvir: () => void;
  hoje: boolean;
}

/** Lista: o briefing todo numa página só, na ordem de sempre. É o padrão no computador. */
export function Lista({ briefing, tema, minutos, criadoEm, podeOuvir, aoOuvir, hoje }: Props) {
  const info = TEMAS[tema];
  return (
    <div className="lista">
      <header className="cabeca-lista">
        <div className="cabeca-nucleo">
          <Nucleo tema={tema} titulo={info.nome} />
        </div>
        <div>
          <div className="fita" aria-hidden="true" />
          {tema !== "luto" && <p className="rotulo">{info.nome}</p>}
          <h1 className="manchete grande">{briefing.historiaDoDia.titulo}</h1>
          <p className="corpo suave">{briefing.historiaDoDia.resumo}</p>
          <p className="meta">
            {dataPorExtenso(briefing.data)} · leitura de {minutos} min · gerado às{" "}
            {horaBr(criadoEm)}
          </p>
          <div className="acoes">
            {podeOuvir && (
              <button type="button" className="botao" onClick={aoOuvir}>
                ▶ Ouvir
              </button>
            )}
            <button
              type="button"
              className="botao secundario"
              onClick={() => salvarPrefs({ modo: "stories" })}
            >
              Ver em Stories
            </button>
            {!hoje && (
              <a className="botao secundario" href={hrefDe({ nome: "hoje" })}>
                Voltar para hoje
              </a>
            )}
          </div>
        </div>
      </header>

      <EmTrintaSegundos pontos={briefing.emTrintaSegundos} />
      <TempoView tempo={briefing.tempo} />

      {briefing.secoes.map((secao) => (
        <section key={secao.id} className="secao" aria-label={NOMES_DE_SECAO[secao.id]}>
          <h2 className="secao-titulo">{NOMES_DE_SECAO[secao.id]}</h2>
          {secao.noticias.map((noticia) => (
            <NoticiaView key={noticia.titulo} noticia={noticia} rotulo={secao.id} semRotulo />
          ))}
        </section>
      ))}

      {briefing.curiosidade && (
        <section className="secao" aria-label="Curiosidade">
          <h2 className="secao-titulo">{NOMES_DE_SECAO.curiosidade}</h2>
          <NoticiaView noticia={briefing.curiosidade} rotulo="curiosidade" semRotulo />
        </section>
      )}

      <footer className="rodape-lista">
        <p className="suave">Visual escolhido porque: {briefing.tema.motivo}</p>
      </footer>
    </div>
  );
}
