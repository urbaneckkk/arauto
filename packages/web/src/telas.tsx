import { TEMA_IDS, type TemaId } from "@arauto/core";
import { type CSSProperties, useState } from "react";
import { Abertura } from "./abertura";
import { briefingDeAmostra } from "./amostra";
import { detectarPlataforma, ehSafariDoIos, useInstalacao } from "./instalacao";
import { Nucleo } from "./nucleo";
import { OUVIR_DISPONIVEL } from "./ouvir";
import { type Modo, salvarPrefs, usePrefs } from "./prefs";
import { hrefDe } from "./rotas";
import { TEMAS } from "./temas";
import { useIndice } from "./usar-dados";
import { dataBr } from "./util";

export function Carregando({ texto = "Carregando o briefing…" }: { texto?: string }) {
  return (
    <div className="tela-simples" role="status">
      <p className="corpo suave">{texto}</p>
    </div>
  );
}

export function Falha({ mensagem, aoTentar }: { mensagem: string; aoTentar: () => void }) {
  return (
    <div className="tela-simples">
      <h1 className="manchete">Sem briefing por enquanto</h1>
      <p className="corpo">{mensagem}</p>
      <div className="acoes">
        <button type="button" className="botao" onClick={aoTentar}>
          Tentar de novo
        </button>
        <a className="botao secundario" href={hrefDe({ nome: "instalar" })}>
          Como instalar
        </a>
      </div>
    </div>
  );
}

export function Historico() {
  const { carga, recarregar } = useIndice();
  return (
    <div className="tela-simples">
      <h1 className="manchete">Dias anteriores</h1>
      {carga.tipo === "carregando" && <p className="corpo suave">Carregando…</p>}
      {carga.tipo === "erro" && (
        <>
          <p className="corpo">{carga.mensagem}</p>
          <button type="button" className="botao" onClick={recarregar}>
            Tentar de novo
          </button>
        </>
      )}
      {carga.tipo === "ok" && carga.valor.length === 0 && (
        <p className="corpo suave">Ainda não há dias anteriores.</p>
      )}
      {carga.tipo === "ok" && (
        <ul className="historico">
          {[...carga.valor]
            .sort((a, b) => b.data.localeCompare(a.data))
            .map((item) => {
              const info = TEMAS[TEMA_IDS.find((id) => id === item.tema) ?? "neutro"];
              return (
                <li key={item.data}>
                  <a href={hrefDe({ nome: "dia", data: item.data })}>
                    <span className="historico-emoji" aria-hidden="true">
                      {info.emoji}
                    </span>
                    <span className="historico-texto">
                      <span className="rotulo">{dataBr(item.data)}</span>
                      <span className="historico-titulo">{item.titulo}</span>
                    </span>
                  </a>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}

const MODOS: { valor: Modo | null; nome: string }[] = [
  { valor: null, nome: "Automático" },
  { valor: "stories", nome: "Stories" },
  { valor: "lista", nome: "Lista" },
];

export function Ajustes() {
  const prefs = usePrefs();
  const [testando, setTestando] = useState(false);

  const testarVoz = () => {
    if (!OUVIR_DISPONIVEL) return;
    window.speechSynthesis.cancel();
    const fala = new SpeechSynthesisUtterance("Assim soa a voz do modo Ouvir, nesta velocidade.");
    fala.lang = "pt-BR";
    fala.rate = prefs.velocidade;
    fala.onend = () => setTestando(false);
    fala.onerror = () => setTestando(false);
    setTestando(true);
    window.speechSynthesis.speak(fala);
  };

  return (
    <div className="tela-simples ajustes">
      <h1 className="manchete">Ajustes</h1>

      <fieldset>
        <legend>Como ler</legend>
        <div className="opcoes">
          {MODOS.map((m) => (
            <label key={m.nome} className={prefs.modo === m.valor ? "marcada" : ""}>
              <input
                type="radio"
                name="modo"
                checked={prefs.modo === m.valor}
                onChange={() => salvarPrefs({ modo: m.valor })}
              />
              {m.nome}
            </label>
          ))}
        </div>
        <p className="suave">Automático: Stories no celular, Lista no computador.</p>
      </fieldset>

      <fieldset>
        <legend>Visual</legend>
        <label className="linha">
          <input
            type="checkbox"
            checked={prefs.sobrio}
            onChange={(e) => salvarPrefs({ sobrio: e.target.checked })}
          />
          <span>
            <strong>Modo sóbrio</strong>
            <span className="suave"> — sempre o visual neutro, sem abertura e sem movimento.</span>
          </span>
        </label>
        <label className="linha coluna">
          <span>Trocar o visual à mão</span>
          <select
            value={prefs.temaManual ?? ""}
            onChange={(e) =>
              salvarPrefs({ temaManual: TEMA_IDS.find((id) => id === e.target.value) ?? null })
            }
            disabled={prefs.sobrio}
          >
            <option value="">Automático (o do dia)</option>
            {TEMA_IDS.map((id) => (
              <option key={id} value={id}>
                {TEMAS[id].emoji} {TEMAS[id].nome}
              </option>
            ))}
          </select>
        </label>
        <div className="acoes">
          <button
            type="button"
            className="botao secundario"
            onClick={() => salvarPrefs({ visto: null })}
          >
            Ver a abertura de novo
          </button>
          <a className="botao secundario" href={hrefDe({ nome: "lab" })}>
            Laboratório de temas
          </a>
        </div>
      </fieldset>

      <fieldset>
        <legend>Ouvir</legend>
        {OUVIR_DISPONIVEL ? (
          <>
            <label className="linha coluna">
              <span>Velocidade da voz: {prefs.velocidade.toFixed(1)}×</span>
              <input
                type="range"
                min="0.7"
                max="1.6"
                step="0.1"
                value={prefs.velocidade}
                onChange={(e) => salvarPrefs({ velocidade: Number(e.target.value) })}
              />
            </label>
            <button
              type="button"
              className="botao secundario"
              onClick={testarVoz}
              disabled={testando}
            >
              {testando ? "Falando…" : "Testar a voz"}
            </button>
          </>
        ) : (
          <p className="suave">
            Este navegador não tem voz embutida, então o modo Ouvir não aparece.
          </p>
        )}
      </fieldset>

      <fieldset>
        <legend>Sobre</legend>
        <p className="suave">
          O ARAUTO não tem conta e não coleta nada: estes ajustes ficam só neste aparelho. O
          briefing é gerado uma vez por dia e publicado como arquivo; não existe botão que gaste
          dinheiro a cada toque.
        </p>
        <div className="acoes">
          <a className="botao secundario" href={hrefDe({ nome: "instalar" })}>
            Instalar no celular ou no PC
          </a>
        </div>
      </fieldset>
    </div>
  );
}

export function Instalar() {
  const { podeInstalar, instalado, instalar } = useInstalacao();
  const plataforma = detectarPlataforma(navigator.userAgent, navigator.maxTouchPoints);
  const safari = ehSafariDoIos(navigator.userAgent);

  return (
    <div className="tela-simples">
      <h1 className="manchete">Instalar o ARAUTO</h1>
      {instalado && (
        <p className="corpo">Você já está usando o app instalado. Nada a fazer aqui.</p>
      )}

      {!instalado && podeInstalar && (
        <div className="acoes">
          <button type="button" className="botao" onClick={() => void instalar()}>
            Instalar agora
          </button>
        </div>
      )}

      <section className="passo-a-passo" data-destaque={plataforma === "ios"}>
        <h2 className="secao-titulo">iPhone e iPad (Safari)</h2>
        {plataforma === "ios" && !safari && (
          <p className="alerta-aviso">
            Abra este mesmo endereço no <strong>Safari</strong>: é lá que o iPhone oferece a
            instalação.
          </p>
        )}
        <ol>
          <li>
            Toque no botão <strong>Compartilhar</strong> (o quadrado com a seta para cima, na barra
            de baixo).
          </li>
          <li>
            Role e toque em <strong>Adicionar à Tela de Início</strong>.
          </li>
          <li>
            Toque em <strong>Adicionar</strong>. O ícone do ARAUTO aparece na tela inicial e abre em
            tela cheia.
          </li>
        </ol>
      </section>

      <section className="passo-a-passo" data-destaque={plataforma === "android"}>
        <h2 className="secao-titulo">Android (Chrome)</h2>
        <ol>
          <li>
            Toque nos <strong>três pontinhos</strong> do Chrome.
          </li>
          <li>
            Toque em <strong>Instalar app</strong> (ou <strong>Adicionar à tela inicial</strong>).
          </li>
        </ol>
      </section>

      <section className="passo-a-passo" data-destaque={plataforma === "computador"}>
        <h2 className="secao-titulo">Computador (Chrome ou Edge)</h2>
        <ol>
          <li>
            Na barra de endereço, clique no ícone de <strong>instalar</strong> (um monitor com uma
            seta), à direita.
          </li>
          <li>
            Clique em <strong>Instalar</strong>. O ARAUTO ganha janela própria e atalho no menu
            Iniciar.
          </li>
        </ol>
      </section>

      <p className="suave">
        Depois de instalado, o app abre mesmo sem internet, com o último briefing que você viu.
      </p>
    </div>
  );
}

/** Laboratório: todos os temas lado a lado, com texto de mentira, para conferir o visual. */
export function Lab() {
  const [aberto, setAberto] = useState<TemaId | null>(null);
  const [intensidade, setIntensidade] = useState<1 | 2 | 3>(2);
  const b = briefingDeAmostra();

  return (
    <div className="tela-simples lab">
      <h1 className="manchete">Laboratório de temas</h1>
      <p className="corpo suave">
        Os textos aqui são de mentira, só para ver o visual. Temas marcados com “provisório” ainda
        não têm o desenho final do Claude Design.
      </p>
      <fieldset className="acoes">
        <legend className="so-leitor">Intensidade</legend>
        {([1, 2, 3] as const).map((n) => (
          <button
            key={n}
            type="button"
            className={n === intensidade ? "botao" : "botao secundario"}
            aria-pressed={n === intensidade}
            onClick={() => setIntensidade(n)}
          >
            Intensidade {n}
          </button>
        ))}
      </fieldset>
      <ul className="grade-lab">
        {TEMA_IDS.map((id) => (
          <li key={id}>
            <article
              className="cartao-lab"
              data-tema={id}
              data-intensidade={intensidade}
              style={{ "--forca": intensidade } as CSSProperties}
            >
              <div className="cartao-lab-nucleo">
                <Nucleo tema={id} />
              </div>
              <p className="rotulo">
                {TEMAS[id].nome}
                {!TEMAS[id].desenhado && " · provisório"}
              </p>
              <h2 className="manchete">{TEMAS[id].exemplo}</h2>
              <p className="corpo suave">{b.emTrintaSegundos[0]}</p>
              <button type="button" className="botao secundario" onClick={() => setAberto(id)}>
                Ver abertura
              </button>
            </article>
          </li>
        ))}
      </ul>
      {aberto && <Abertura tema={aberto} aoTerminar={() => setAberto(null)} />}
    </div>
  );
}
