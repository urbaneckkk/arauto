import { readFileSync } from "node:fs";
import { BriefingSchema, TEMA_IDS } from "@arauto/core";
import { describe, expect, it } from "vitest";
import { briefingDeAmostra } from "../src/amostra";
import { interpretarGesto } from "../src/gestos";
import { detectarPlataforma, ehSafariDoIos } from "../src/instalacao";
import { montarTrechos, quebrarEmPedacos } from "../src/ouvir";
import { escolherModo, limparPrefs, PADRAO } from "../src/prefs";
import { hrefDe, lerRota } from "../src/rotas";
import { TEMAS, temaAtivo } from "../src/temas";
import { mensagemDeErro } from "../src/usar-dados";
import { dataBr, hojeEmSaoPaulo, minutosDeLeitura, veiculoDe } from "../src/util";

describe("temas", () => {
  it("todos os 15 temas do catálogo têm nome, emoji e abertura entre 1,5 e 2,5 s", () => {
    expect(Object.keys(TEMAS).sort()).toEqual([...TEMA_IDS].sort());
    for (const id of TEMA_IDS) {
      expect(TEMAS[id].nome.length).toBeGreaterThan(0);
      expect(TEMAS[id].emoji.length).toBeGreaterThan(0);
      expect(TEMAS[id].aberturaMs).toBeGreaterThanOrEqual(1500);
      expect(TEMAS[id].aberturaMs).toBeLessThanOrEqual(2500);
    }
  });

  it("todo tema tem seu bloco de cores em temas.css", () => {
    const css = readFileSync(new URL("../src/temas.css", import.meta.url), "utf8");
    for (const id of TEMA_IDS) expect(css).toContain(`[data-tema="${id}"]`);
  });

  it("o luto nunca tem som nem movimento: a abertura dele é só fade e o CSS o deixa parado", () => {
    expect(TEMAS.luto.aberturaMs).toBe(1500);
    const css = readFileSync(new URL("../src/temas.css", import.meta.url), "utf8");
    expect(css).toMatch(/\[data-tema="luto"\] \.ambiente\s*{\s*display: none;/);
    expect(css).toMatch(/\[data-tema="luto"\] \.nucleo \*[^{]*{\s*animation: none !important;/);
  });

  it("usa o tema do briefing, ou neutro no modo sóbrio, ou o escolhido à mão", () => {
    const b = briefingDeAmostra("clima_extremo");
    expect(temaAtivo(b, PADRAO)).toEqual({ id: "clima_extremo", intensidade: 2 });
    expect(temaAtivo(b, { ...PADRAO, sobrio: true }).id).toBe("neutro");
    expect(temaAtivo(b, { ...PADRAO, temaManual: "esporte" }).id).toBe("esporte");
    expect(temaAtivo(null, PADRAO).id).toBe("neutro");
  });

  it("tema desconhecido no arquivo cai em neutro, sem quebrar", () => {
    const b = briefingDeAmostra();
    const estranho = { ...b, tema: { ...b.tema, id: "tema_que_nao_existe" as never } };
    expect(temaAtivo(estranho, PADRAO).id).toBe("neutro");
  });
});

describe("amostra e leitura", () => {
  it("o briefing de amostra respeita o contrato do core, para todos os temas", () => {
    for (const id of TEMA_IDS)
      expect(BriefingSchema.safeParse(briefingDeAmostra(id)).success).toBe(true);
  });

  it("conta ao menos 1 minuto de leitura", () => {
    expect(minutosDeLeitura(briefingDeAmostra())).toBeGreaterThanOrEqual(1);
  });

  it("monta os trechos do modo Ouvir: abertura, 30 segundos, tempo, notícias e fim", () => {
    const b = briefingDeAmostra();
    const trechos = montarTrechos(b);
    const noticias = b.secoes.reduce((s, x) => s + x.noticias.length, 0) + 1;
    expect(trechos).toHaveLength(3 + noticias + 1);
    expect(trechos[0]?.texto).toContain(b.historiaDoDia.titulo);
    expect(trechos.at(-1)?.rotulo).toBe("Fim");
  });

  it("quebra falas longas em pedaços curtos, no fim de frase, sem perder texto", () => {
    const texto = `${"Frase curta de teste. ".repeat(40)}Última frase sem muito mais.`;
    const pedacos = quebrarEmPedacos(texto, 120);
    expect(pedacos.length).toBeGreaterThan(5);
    for (const p of pedacos) expect(p.length).toBeLessThanOrEqual(180);
    expect(pedacos.join(" ").replace(/\s+/g, " ")).toBe(texto.replace(/\s+/g, " ").trim());
  });

  it("quebra uma frase gigante sem ponto em vírgulas ou espaços", () => {
    const frase = Array.from({ length: 80 }, (_, n) => `palavra${n}`).join(" ");
    const pedacos = quebrarEmPedacos(frase, 100);
    expect(pedacos.length).toBeGreaterThan(3);
    expect(pedacos.join(" ")).toBe(frase);
  });
});

describe("util", () => {
  it("a data de hoje é a de São Paulo, não a do relógio em UTC", () => {
    // 01:30 UTC de 5/11 ainda é noite de 4/11 em São Paulo (UTC-3).
    expect(hojeEmSaoPaulo(new Date("2026-11-05T01:30:00Z"))).toBe("2026-11-04");
    expect(hojeEmSaoPaulo(new Date("2026-11-05T09:30:00Z"))).toBe("2026-11-05");
  });

  it("formata datas e nomes de veículos", () => {
    expect(dataBr("2026-11-05")).toBe("05/11/2026");
    expect(veiculoDe("https://g1.globo.com/economia/x")).toBe("g1");
    expect(veiculoDe("https://www.agenciabrasil.ebc.com.br/a")).toBe("Agência Brasil");
    expect(veiculoDe("https://redir.folha.com.br/x")).toBe("redir.folha.com.br");
    expect(veiculoDe("isto não é url")).toBe("fonte");
  });
});

describe("rotas", () => {
  it("reconhece as telas e cai em hoje quando não entende", () => {
    expect(lerRota("")).toEqual({ nome: "hoje" });
    expect(lerRota("#/")).toEqual({ nome: "hoje" });
    expect(lerRota("#/historico")).toEqual({ nome: "historico" });
    expect(lerRota("#/ajustes")).toEqual({ nome: "ajustes" });
    expect(lerRota("#/lab")).toEqual({ nome: "lab" });
    expect(lerRota("#/instalar")).toEqual({ nome: "instalar" });
    expect(lerRota("#/dia/2026-11-04")).toEqual({ nome: "dia", data: "2026-11-04" });
    expect(lerRota("#/dia/../../etc/passwd")).toEqual({ nome: "hoje" });
    expect(lerRota("#/qualquer-coisa")).toEqual({ nome: "hoje" });
  });

  it("monta os endereços", () => {
    expect(hrefDe({ nome: "hoje" })).toBe("#/");
    expect(hrefDe({ nome: "dia", data: "2026-11-04" })).toBe("#/dia/2026-11-04");
    expect(hrefDe({ nome: "lab" })).toBe("#/lab");
  });
});

describe("preferências", () => {
  it("aceita só valores válidos e usa o padrão no resto", () => {
    expect(limparPrefs(null)).toEqual(PADRAO);
    expect(limparPrefs("lixo")).toEqual(PADRAO);
    expect(
      limparPrefs({
        modo: "lista",
        sobrio: true,
        temaManual: "luto",
        velocidade: 1.3,
        visto: "2026-11-04#1",
      }),
    ).toEqual({
      modo: "lista",
      sobrio: true,
      temaManual: "luto",
      velocidade: 1.3,
      visto: "2026-11-04#1",
    });
    expect(
      limparPrefs({ modo: "hacker", temaManual: "inventado", velocidade: 99, sobrio: "sim" }),
    ).toEqual(PADRAO);
  });

  it("escolhe Stories no celular e Lista no computador, a menos que a pessoa tenha escolhido", () => {
    expect(escolherModo(PADRAO, true)).toBe("stories");
    expect(escolherModo(PADRAO, false)).toBe("lista");
    expect(escolherModo({ ...PADRAO, modo: "lista" }, true)).toBe("lista");
  });
});

describe("gestos dos Stories", () => {
  const p = (x: number, y: number, t: number) => ({ x, y, t });
  it("toque curto à direita avança, à esquerda volta", () => {
    expect(interpretarGesto(p(300, 400, 0), p(302, 401, 120), 400)).toBe("proximo");
    expect(interpretarGesto(p(40, 400, 0), p(41, 400, 120), 400)).toBe("anterior");
  });
  it("arrastar para a esquerda avança e para a direita volta", () => {
    expect(interpretarGesto(p(300, 400, 0), p(180, 410, 200), 400)).toBe("proximo");
    expect(interpretarGesto(p(100, 400, 0), p(230, 395, 200), 400)).toBe("anterior");
  });
  it("rolar o texto na vertical, ou segurar o dedo, não troca de tela", () => {
    expect(interpretarGesto(p(200, 600, 0), p(205, 300, 200), 400)).toBeNull();
    expect(interpretarGesto(p(300, 400, 0), p(301, 400, 900), 400)).toBeNull();
  });
});

describe("instalação", () => {
  const IPHONE =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const IPHONE_CHROME =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1";
  it("reconhece a plataforma", () => {
    expect(detectarPlataforma(IPHONE, 5)).toBe("ios");
    expect(detectarPlataforma("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe("ios");
    expect(detectarPlataforma("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(
      "computador",
    );
    expect(detectarPlataforma("Mozilla/5.0 (Linux; Android 14; Pixel 8)", 5)).toBe("android");
    expect(detectarPlataforma("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 0)).toBe("computador");
  });
  it("distingue o Safari do iPhone de outros navegadores no iPhone", () => {
    expect(ehSafariDoIos(IPHONE)).toBe(true);
    expect(ehSafariDoIos(IPHONE_CHROME)).toBe(false);
  });
});

describe("mensagens de erro", () => {
  it("fala de um jeito que a pessoa entende", () => {
    expect(mensagemDeErro(new Error("HTTP 404"))).toContain("Ainda não saiu");
    expect(mensagemDeErro(new Error("HTTP 503"))).toContain("servidor");
    expect(mensagemDeErro(new TypeError("Failed to fetch"))).toContain("Sem conexão");
    const zod = new Error("x");
    zod.name = "ZodError";
    expect(mensagemDeErro(zod)).toContain("formato");
  });
});
