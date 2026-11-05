import { useCallback, useEffect, useMemo, useState } from "react";
import { Abertura } from "./abertura";
import { Ambiente } from "./ambiente";
import { BarraOuvir } from "./barra-ouvir";
import type { Registro } from "./dados";
import { Lista } from "./lista";
import { montarTrechos, OUVIR_DISPONIVEL, useOuvir } from "./ouvir";
import { salvarPrefs, useModo, usePrefs } from "./prefs";
import { hrefDe, type Rota, useRota } from "./rotas";
import { Stories } from "./stories";
import { Ajustes, Carregando, Falha, Historico, Instalar, Lab } from "./telas";
import { temaAtivo } from "./temas";
import { useDia, useOnline, useUltimo } from "./usar-dados";
import { dataBr, hojeEmSaoPaulo, minutosDeLeitura } from "./util";

/** O que se lê: abertura (só no briefing de hoje), Stories ou Lista, e o controle de voz. */
function Leitor({ registro, hoje }: { registro: Registro; hoje: boolean }) {
  const prefs = usePrefs();
  const modo = useModo();
  const briefing = registro.briefing;
  const tema = temaAtivo(briefing, prefs);
  const chave = `${registro.data}#${registro.versao}`;

  const [abertura, setAbertura] = useState(() => hoje && !prefs.sobrio && prefs.visto !== chave);
  const [barra, setBarra] = useState(false);

  const trechos = useMemo(() => montarTrechos(briefing), [briefing]);
  const minutos = useMemo(() => minutosDeLeitura(briefing), [briefing]);
  const ouvir = useOuvir(trechos, prefs.velocidade);

  const terminarAbertura = useCallback(() => {
    setAbertura(false);
    salvarPrefs({ visto: chave });
  }, [chave]);

  const comecarAOuvir = useCallback(() => {
    setBarra(true);
    ouvir.iniciar();
  }, [ouvir.iniciar]);

  const propriedades = {
    briefing,
    tema: tema.id,
    minutos,
    criadoEm: registro.criadoEm,
    podeOuvir: OUVIR_DISPONIVEL,
    aoOuvir: comecarAOuvir,
    hoje,
  };

  return (
    <>
      {abertura && <Abertura tema={tema.id} aoTerminar={terminarAbertura} />}
      {modo === "stories" ? <Stories {...propriedades} /> : <Lista {...propriedades} />}
      {barra && <BarraOuvir controle={ouvir} aoFechar={() => setBarra(false)} />}
    </>
  );
}

function Barra({ rota }: { rota: Rota }) {
  const itens: { rota: Rota; nome: string; ativo: boolean }[] = [
    { rota: { nome: "hoje" }, nome: "Hoje", ativo: rota.nome === "hoje" || rota.nome === "dia" },
    { rota: { nome: "historico" }, nome: "Dias", ativo: rota.nome === "historico" },
    { rota: { nome: "ajustes" }, nome: "Ajustes", ativo: rota.nome === "ajustes" },
  ];
  return (
    <header className="barra">
      <a className="marca" href={hrefDe({ nome: "hoje" })}>
        ARAUTO
      </a>
      <nav aria-label="Principal">
        {itens.map((item) => (
          <a
            key={item.nome}
            href={hrefDe(item.rota)}
            aria-current={item.ativo ? "page" : undefined}
          >
            {item.nome}
          </a>
        ))}
      </nav>
    </header>
  );
}

export function App() {
  const rota = useRota();
  const prefs = usePrefs();
  const online = useOnline();
  const ultimo = useUltimo();
  const dia = useDia(rota.nome === "dia" ? rota.data : null);

  const registroDoDia = dia.carga.tipo === "ok" ? dia.carga.valor : null;
  const registroDeHoje = ultimo.carga.tipo === "ok" ? ultimo.carga.valor : null;
  const doTema = rota.nome === "dia" ? registroDoDia : registroDeHoje;
  const tema = temaAtivo(doTema?.briefing ?? null, prefs);

  useEffect(() => {
    const raiz = document.documentElement;
    raiz.dataset.tema = tema.id;
    raiz.dataset.intensidade = String(tema.intensidade);
    raiz.dataset.semMovimento = prefs.sobrio ? "1" : "0";
    const cor = getComputedStyle(raiz).getPropertyValue("--fundo").trim();
    if (cor) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", cor);
  }, [tema.id, tema.intensidade, prefs.sobrio]);

  const modo = useModo();
  const lendo = rota.nome === "hoje" || rota.nome === "dia";
  const hoje = hojeEmSaoPaulo();
  const desatualizado = registroDeHoje !== null && registroDeHoje.data < hoje;

  let tela: React.ReactNode;
  if (rota.nome === "ajustes") tela = <Ajustes />;
  else if (rota.nome === "historico") tela = <Historico />;
  else if (rota.nome === "instalar") tela = <Instalar />;
  else if (rota.nome === "lab") tela = <Lab />;
  else if (rota.nome === "dia") {
    if (dia.carga.tipo === "carregando") tela = <Carregando texto="Carregando o dia…" />;
    else if (dia.carga.tipo === "erro")
      tela = <Falha mensagem={dia.carga.mensagem} aoTentar={dia.recarregar} />;
    else tela = <Leitor key={dia.carga.valor.data} registro={dia.carga.valor} hoje={false} />;
  } else if (ultimo.carga.tipo === "carregando") tela = <Carregando />;
  else if (ultimo.carga.tipo === "erro")
    tela = <Falha mensagem={ultimo.carga.mensagem} aoTentar={ultimo.recarregar} />;
  else {
    tela = (
      <Leitor
        key={`${ultimo.carga.valor.data}#${ultimo.carga.valor.versao}`}
        registro={ultimo.carga.valor}
        hoje
      />
    );
  }

  return (
    <div className={`app modo-${lendo && modo === "stories" ? "stories" : "pagina"}`}>
      <Ambiente intensidade={tema.intensidade} />
      <Barra rota={rota} />
      {!online && (
        <p className="aviso" role="status">
          Sem internet. Você está vendo o que ficou guardado neste aparelho.
        </p>
      )}
      {rota.nome === "hoje" && desatualizado && registroDeHoje && (
        <p className="aviso" role="status">
          Briefing de {dataBr(registroDeHoje.data)}. O de hoje ainda não saiu.{" "}
          <button type="button" className="link" onClick={ultimo.recarregar}>
            Ver se já saiu
          </button>
        </p>
      )}
      <main>{tela}</main>
    </div>
  );
}
