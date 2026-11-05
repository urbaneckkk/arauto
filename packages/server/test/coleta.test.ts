import { describe, expect, it } from "vitest";
import { coletar } from "../src/coleta/coletar.js";
import { consultarGdelt, urlDoGdelt } from "../src/coleta/gdelt.js";
import {
  GEOCODE_CURITIBA,
  lerAlertasDeCuritiba,
  nivelDeSeveridade,
  URL_INMET,
} from "../src/coleta/inmet.js";
import { descricaoDoCodigoWmo, lerTempo, URL_OPEN_METEO } from "../src/coleta/openmeteo.js";
import { lerFeed } from "../src/coleta/rss.js";
import type { FeedConfig } from "../src/coleta/tipos.js";
import { logSilencioso } from "../src/infra/log.js";
import { relogioFixo } from "../src/util/tempo.js";
import { ok, rss, transporteDeMapa } from "./ajudantes.js";

/** 05/11/2026, 06:00 em São Paulo. */
const AGORA = new Date("2026-11-05T09:00:00Z");

describe("lerFeed", () => {
  it("lê RSS 2.0, com CDATA, data e descrição", () => {
    const xml = `<rss version="2.0"><channel>
      <item><title><![CDATA[Título de teste]]></title><link>https://exemplo.com/a</link>
      <pubDate>Thu, 05 Nov 2026 05:00:00 +0000</pubDate><description><![CDATA[<p>Resumo <b>inventado</b></p>]]></description></item>
    </channel></rss>`;
    const [item] = lerFeed(xml);
    expect(item).toEqual({
      titulo: "Título de teste",
      url: "https://exemplo.com/a",
      data: "2026-11-05T05:00:00.000Z",
      resumo: "<p>Resumo <b>inventado</b></p>",
    });
  });

  it("lê feed com um único item (não vem como lista)", () => {
    expect(
      lerFeed(
        rss([
          {
            titulo: "Só um",
            url: "https://exemplo.com/1",
            data: "Thu, 05 Nov 2026 05:00:00 +0000",
          },
        ]),
      ),
    ).toHaveLength(1);
  });

  it("lê Atom, escolhendo o link alternate", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Entrada</title>
      <link rel="self" href="https://exemplo.com/self"/><link rel="alternate" href="https://exemplo.com/certo"/>
      <updated>2026-11-05T05:00:00Z</updated><summary>Resumo</summary></entry></feed>`;
    const [item] = lerFeed(xml);
    expect(item?.url).toBe("https://exemplo.com/certo");
    expect(item?.data).toBe("2026-11-05T05:00:00.000Z");
  });

  it("lê RSS 1.0 (RDF) com data em dc:date", () => {
    const xml = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <item><title>RDF</title><link>https://exemplo.com/r</link><dc:date>2026-11-05T05:00:00Z</dc:date></item></rdf:RDF>`;
    expect(lerFeed(xml)[0]?.data).toBe("2026-11-05T05:00:00.000Z");
  });

  it("data ausente ou ilegível vira nulo", () => {
    const itens = lerFeed(
      rss([
        { titulo: "a", url: "https://exemplo.com/a" },
        { titulo: "b", url: "https://exemplo.com/b", data: "ontem à noite" },
      ]),
    );
    expect(itens.map((i) => i.data)).toEqual([null, null]);
  });

  it("recusa o que não é feed e aguenta BOM e bytes nulos", () => {
    expect(() => lerFeed("<html><body>oi</body></html>")).toThrow(/não é um feed/);
    expect(lerFeed(`﻿${rss([{ titulo: "x\u0000", url: "https://exemplo.com/x" }])}`)).toHaveLength(
      1,
    );
  });
});

const feed = (id: string, extras: Partial<FeedConfig> = {}): FeedConfig => ({
  id,
  nome: id,
  veiculo: `Veículo ${id}`,
  url: `https://feeds.exemplo.com/${id}.xml`,
  pais: "BR",
  idioma: "pt",
  ...extras,
});

const dataRss = (horasAtras: number) =>
  new Date(AGORA.getTime() - horasAtras * 3_600_000).toUTCString();

describe("coletar (passo 1)", () => {
  async function rodar(mapa: Parameters<typeof transporteDeMapa>[0], feeds: FeedConfig[]) {
    return coletar({
      transporte: transporteDeMapa(mapa),
      relogio: relogioFixo(AGORA),
      log: logSilencioso,
      feeds,
    });
  }

  it("filtra por data: velho, futuro e sem data ficam de fora", async () => {
    const resultado = await rodar(
      {
        "https://feeds.exemplo.com/a.xml": ok(
          rss([
            { titulo: "Recente", url: "https://exemplo.com/recente", data: dataRss(2) },
            { titulo: "No limite", url: "https://exemplo.com/limite", data: dataRss(35) },
            { titulo: "Velho", url: "https://exemplo.com/velho", data: dataRss(37) },
            { titulo: "Do futuro", url: "https://exemplo.com/futuro", data: dataRss(-5) },
            { titulo: "Sem data", url: "https://exemplo.com/sem-data" },
          ]),
        ),
      },
      [feed("a")],
    );
    expect(resultado.itens.map((i) => i.titulo)).toEqual(["Recente", "No limite"]);
  });

  it("numera os itens, limpa o título e o resumo e tira rastreio da URL", async () => {
    const resultado = await rodar(
      {
        "https://feeds.exemplo.com/a.xml": ok(
          rss([
            {
              titulo: "Dólar &amp; juros",
              url: "http://exemplo.com/a?utm_source=x#topo",
              data: dataRss(1),
              resumo: "&lt;p&gt;Texto&lt;/p&gt;",
            },
          ]),
        ),
      },
      [feed("a", { dica: "economia" })],
    );
    expect(resultado.itens).toEqual([
      {
        id: "i001",
        feedId: "a",
        veiculo: "Veículo a",
        pais: "BR",
        idioma: "pt",
        titulo: "Dólar & juros",
        url: "https://exemplo.com/a",
        publicadoEm: new Date(AGORA.getTime() - 3_600_000).toISOString(),
        resumo: "Texto",
        dica: "economia",
      },
    ]);
  });

  it("tira repetidos entre feeds pela URL, e o primeiro feed vence", async () => {
    const item = { titulo: "Mesma notícia", url: "https://exemplo.com/mesma", data: dataRss(1) };
    const resultado = await rodar(
      {
        "https://feeds.exemplo.com/a.xml": ok(rss([item])),
        "https://feeds.exemplo.com/b.xml": ok(
          rss([{ ...item, url: "http://exemplo.com/mesma?utm_medium=z" }]),
        ),
      },
      [feed("a"), feed("b")],
    );
    expect(resultado.itens).toHaveLength(1);
    expect(resultado.itens[0]?.feedId).toBe("a");
  });

  it("respeita o limite de itens por feed, ficando com os mais recentes", async () => {
    const itens = [5, 1, 3, 2, 4].map((h) => ({
      titulo: `${h}h`,
      url: `https://exemplo.com/${h}`,
      data: dataRss(h),
    }));
    const resultado = await rodar({ "https://feeds.exemplo.com/a.xml": ok(rss(itens)) }, [
      feed("a", { limite: 2 }),
    ]);
    expect(resultado.itens.map((i) => i.titulo)).toEqual(["1h", "2h"]);
  });

  it("classifica a saúde de cada feed: ok, parado, vazio e fora", async () => {
    const resultado = await rodar(
      {
        "https://feeds.exemplo.com/ok.xml": ok(
          rss([{ titulo: "x", url: "https://exemplo.com/x", data: dataRss(1) }]),
        ),
        "https://feeds.exemplo.com/parado.xml": ok(
          rss([{ titulo: "y", url: "https://exemplo.com/y", data: dataRss(24 * 30) }]),
        ),
        "https://feeds.exemplo.com/vazio.xml": ok(rss([])),
        "https://feeds.exemplo.com/404.xml": { status: 404, contentType: "text/html", corpo: "" },
        "https://feeds.exemplo.com/caiu.xml": new Error("tempo esgotado"),
        "https://feeds.exemplo.com/html.xml": ok("<html></html>"),
      },
      [feed("ok"), feed("parado"), feed("vazio"), feed("404"), feed("caiu"), feed("html")],
    );
    const situacao = Object.fromEntries(resultado.saude.map((s) => [s.feedId, s.situacao]));
    expect(situacao).toEqual({
      ok: "ok",
      parado: "parado",
      vazio: "vazio",
      "404": "fora",
      caiu: "fora",
      html: "fora",
    });
    expect(resultado.saude.find((s) => s.feedId === "caiu")?.erro).toBe("tempo esgotado");
    expect(resultado.saude.find((s) => s.feedId === "404")?.status).toBe(404);
    expect(resultado.avisos.filter((a) => a.startsWith("Feed"))).toHaveLength(3);
    expect(resultado.avisos.find((a) => a.startsWith("Feeds fora do ar"))).toContain("(3)");
    expect(resultado.avisos.find((a) => a.startsWith("Feeds parados"))).toContain("Veículo parado");
  });

  it("um feed quebrado não derruba os outros", async () => {
    const resultado = await rodar(
      {
        "https://feeds.exemplo.com/caiu.xml": new Error("rede"),
        "https://feeds.exemplo.com/ok.xml": ok(
          rss([{ titulo: "x", url: "https://exemplo.com/x", data: dataRss(1) }]),
        ),
      },
      [feed("caiu"), feed("ok")],
    );
    expect(resultado.itens).toHaveLength(1);
  });

  it("tempo e alertas que falham viram aviso, não erro", async () => {
    const resultado = await rodar({ "https://feeds.exemplo.com/a.xml": ok(rss([])) }, [feed("a")]);
    expect(resultado.tempo).toBeNull();
    expect(resultado.alertas).toEqual([]);
    expect(resultado.avisos.some((a) => a.includes("Previsão do tempo indisponível"))).toBe(true);
    expect(resultado.avisos.some((a) => a.includes("Alertas do INMET indisponíveis"))).toBe(true);
  });
});

const respostaOpenMeteo = {
  daily: {
    temperature_2m_max: [27.4],
    temperature_2m_min: [15.8],
    precipitation_probability_max: [40],
    precipitation_sum: [3.2],
    weather_code: [80],
  },
};

describe("Open-Meteo", () => {
  it("lê mínima, máxima, chance de chuva e o tipo de tempo", async () => {
    const tempo = await lerTempo(
      transporteDeMapa({
        [URL_OPEN_METEO]: ok(JSON.stringify(respostaOpenMeteo), "application/json"),
      }),
    );
    expect(tempo).toEqual({
      minC: 15.8,
      maxC: 27.4,
      chuvaPct: 40,
      chuvaMm: 3.2,
      codigoDoTempo: 80,
      descricaoDoTempo: "pancadas de chuva",
    });
  });

  it("chance de chuva nula vira 0", async () => {
    const corpo = {
      daily: {
        ...respostaOpenMeteo.daily,
        precipitation_probability_max: [null],
        precipitation_sum: [null],
      },
    };
    const tempo = await lerTempo(transporteDeMapa({ [URL_OPEN_METEO]: ok(JSON.stringify(corpo)) }));
    expect(tempo.chuvaPct).toBe(0);
    expect(tempo.chuvaMm).toBe(0);
  });

  it("erro HTTP ou formato inesperado é erro", async () => {
    await expect(
      lerTempo(
        transporteDeMapa({ [URL_OPEN_METEO]: { status: 500, contentType: null, corpo: "" } }),
      ),
    ).rejects.toThrow(/500/);
    await expect(lerTempo(transporteDeMapa({ [URL_OPEN_METEO]: ok("{}") }))).rejects.toThrow();
  });

  it("descreve os códigos do tempo", () => {
    expect(descricaoDoCodigoWmo(0)).toBe("céu limpo");
    expect(descricaoDoCodigoWmo(63)).toBe("chuva");
    expect(descricaoDoCodigoWmo(95)).toBe("trovoadas");
    expect(descricaoDoCodigoWmo(1234)).toBe("tempo variável");
  });
});

const aviso = (extras: Record<string, unknown> = {}) => ({
  id_aviso: 28611,
  descricao: "Tempestade",
  severidade: "Perigo",
  data_inicio: "2026-11-05T00:00:00.000Z",
  hora_inicio: "09:00",
  data_fim: "2026-11-05T00:00:00.000Z",
  hora_fim: "23:59",
  geocodes: `4100103,${GEOCODE_CURITIBA},4200051`,
  encerrado: false,
  riscos: ["Chuva forte."],
  instrucoes: ["Evite áreas alagadas."],
  ...extras,
});

describe("INMET", () => {
  const ler = (corpo: unknown) =>
    lerAlertasDeCuritiba(
      transporteDeMapa({ [URL_INMET]: ok(JSON.stringify(corpo), "application/json") }),
      AGORA,
    );

  it("traz o aviso que cobre Curitiba, com nível e horário de São Paulo", async () => {
    const [alerta] = await ler({ hoje: [aviso()], futuro: [] });
    expect(alerta).toMatchObject({
      fonte: "inmet",
      tipo: "Tempestade",
      nivel: "laranja",
      inicio: "2026-11-05T09:00:00-03:00",
      fim: "2026-11-05T23:59:00-03:00",
      quando: "hoje",
      riscos: ["Chuva forte."],
    });
  });

  it("ignora aviso que não cobre Curitiba (a cobertura vem dos códigos IBGE)", async () => {
    const outros = aviso({ geocodes: "4100103,4200051", municipios: "Curitiba - PR (4106902)" });
    expect(await ler({ hoje: [outros], futuro: [] })).toEqual([]);
  });

  it("não confunde código parecido com o de Curitiba", async () => {
    expect(await ler({ hoje: [aviso({ geocodes: "41069020,1410690" })], futuro: [] })).toEqual([]);
  });

  it("ignora aviso encerrado", async () => {
    expect(await ler({ hoje: [aviso({ encerrado: true })], futuro: [] })).toEqual([]);
  });

  it("do futuro, só entra o que começa em até 36 horas", async () => {
    const perto = aviso({ id_aviso: 1, data_inicio: "2026-11-06T00:00:00.000Z" });
    const longe = aviso({
      id_aviso: 2,
      data_inicio: "2026-11-09T00:00:00.000Z",
      data_fim: "2026-11-09T00:00:00.000Z",
    });
    const alertas = await ler({ hoje: [], futuro: [perto, longe] });
    expect(alertas).toHaveLength(1);
    expect(alertas[0]?.quando).toBe("futuro");
  });

  it("ignora item mal formado em vez de derrubar a leitura", async () => {
    expect(await ler({ hoje: [{ lixo: true }, aviso()], futuro: [] })).toHaveLength(1);
  });

  it("converte a severidade para a cor", () => {
    expect(nivelDeSeveridade("Perigo Potencial")).toBe("amarelo");
    expect(nivelDeSeveridade("Perigo")).toBe("laranja");
    expect(nivelDeSeveridade("Grande Perigo")).toBe("vermelho");
    expect(nivelDeSeveridade("Outra coisa")).toBeNull();
  });
});

describe("GDELT", () => {
  it("conta artigos, domínios e países distintos", async () => {
    const corpo = {
      articles: [
        { domain: "a.com", sourcecountry: "Brazil" },
        { domain: "A.com", sourcecountry: "Brazil" },
        { domain: "b.co.uk", sourcecountry: "United Kingdom" },
        {},
      ],
    };
    const cobertura = await consultarGdelt(
      transporteDeMapa({ [urlDoGdelt("storm brazil")]: ok(JSON.stringify(corpo)) }),
      "storm brazil",
    );
    expect(cobertura).toEqual({
      artigos: 4,
      dominios: ["a.com", "b.co.uk"],
      paises: ["Brazil", "United Kingdom"],
    });
  });

  it("resposta vazia ({}) significa zero artigos, e não falha", async () => {
    const cobertura = await consultarGdelt(
      transporteDeMapa({ [urlDoGdelt("nada")]: ok("{}") }),
      "nada",
    );
    expect(cobertura).toEqual({ artigos: 0, dominios: [], paises: [] });
  });

  it("limite de uso (429, texto puro), erro de rede e lixo viram nulo", async () => {
    const limite = {
      status: 429,
      contentType: "text/plain",
      corpo: "Please limit requests to one every 5 seconds",
    };
    expect(await consultarGdelt(transporteDeMapa({ [urlDoGdelt("a")]: limite }), "a")).toBeNull();
    expect(
      await consultarGdelt(
        transporteDeMapa({ [urlDoGdelt("b")]: ok("Please limit requests...") }),
        "b",
      ),
    ).toBeNull();
    expect(
      await consultarGdelt(transporteDeMapa({ [urlDoGdelt("c")]: new Error("timeout") }), "c"),
    ).toBeNull();
  });

  it("codifica a consulta na URL", () => {
    expect(urlDoGdelt('"mars probe" landing')).toContain("query=%22mars%20probe%22%20landing");
  });
});
