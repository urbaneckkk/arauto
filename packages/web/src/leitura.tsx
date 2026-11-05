import type { Alerta, Noticia, Tempo } from "@arauto/core";
import { dataHoraBr, NOMES_DE_SECAO, type RotuloDeSecao, veiculoDe } from "./util";

/** Uma notícia inteira: manchete, o que aconteceu, por que importa, os lados e as fontes. */
export function NoticiaView({
  noticia,
  rotulo,
  semRotulo = false,
}: {
  noticia: Noticia;
  rotulo: RotuloDeSecao;
  semRotulo?: boolean;
}) {
  return (
    <article className="noticia">
      {!semRotulo && <p className="rotulo">{NOMES_DE_SECAO[rotulo]}</p>}
      <h2 className="manchete">{noticia.titulo}</h2>
      <p className="corpo">{noticia.oQueAconteceu}</p>
      <p className="importa">
        <strong>Por que importa.</strong> {noticia.porQueImporta}
      </p>
      {noticia.lados.length > 0 && (
        <ul className="lados">
          {noticia.lados.map((lado) => (
            <li key={`${lado.quem}:${lado.posicao}`}>
              <strong>{lado.quem}:</strong> {lado.posicao}
            </li>
          ))}
        </ul>
      )}
      {noticia.continuaDeOntem && (
        <p className="ontem">
          <strong>Continua de ontem.</strong> {noticia.continuaDeOntem}
        </p>
      )}
      <Fontes fontes={noticia.fontes} />
    </article>
  );
}

export function Fontes({ fontes }: { fontes: Noticia["fontes"] }) {
  return (
    <ul className="fontes" aria-label="Fontes">
      {fontes.map((fonte) => (
        <li key={fonte.url}>
          <a href={fonte.url} target="_blank" rel="noopener noreferrer">
            <span className="fonte-veiculo">{veiculoDe(fonte.url)}</span>
            <span className="fonte-titulo">{fonte.titulo}</span>
            <span className="fonte-hora">{dataHoraBr(fonte.publicadoEm)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

const NIVEIS: Record<Alerta["nivel"], string> = {
  amarelo: "Atenção",
  laranja: "Perigo",
  vermelho: "Grande perigo",
};

function numero(valor: number | null, unidade: string): string {
  return valor === null ? "—" : `${Math.round(valor)}${unidade}`;
}

export function TempoView({ tempo }: { tempo: Tempo }) {
  return (
    <section className="tempo" aria-label="Tempo em Curitiba">
      <p className="rotulo">Tempo em Curitiba</p>
      <dl className="numeros">
        <div>
          <dt>mínima</dt>
          <dd>{numero(tempo.minC, "°")}</dd>
        </div>
        <div>
          <dt>máxima</dt>
          <dd>{numero(tempo.maxC, "°")}</dd>
        </div>
        <div>
          <dt>chuva</dt>
          <dd>{numero(tempo.chuvaPct, "%")}</dd>
        </div>
      </dl>
      <p className="corpo">{tempo.resumo}</p>
      {tempo.alertas.length > 0 && (
        <ul className="alertas">
          {tempo.alertas.map((a) => (
            <li key={`${a.fonte}:${a.tipo}:${a.inicio}`} data-nivel={a.nivel}>
              <strong>{NIVEIS[a.nivel]}:</strong> {a.tipo}{" "}
              <span className="suave">(até {dataHoraBr(a.fim)})</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function EmTrintaSegundos({ pontos }: { pontos: string[] }) {
  return (
    <section className="trinta" aria-label="Em 30 segundos">
      <p className="rotulo">Em 30 segundos</p>
      <ol>
        {pontos.map((ponto) => (
          <li key={ponto}>{ponto}</li>
        ))}
      </ol>
    </section>
  );
}
