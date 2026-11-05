import { describe, expect, it } from "vitest";
import {
  dataEmSaoPaulo,
  isoDeSaoPaulo,
  mesEmSaoPaulo,
  offsetDeSaoPaulo,
} from "../src/util/tempo.js";
import { contarPalavras, cortar, limparHtml } from "../src/util/texto.js";
import { hostDe, pertenceAoDominio, urlCanonica } from "../src/util/url.js";

describe("limparHtml", () => {
  it("tira tags, CDATA e entidades e junta espaços", () => {
    expect(limparHtml("<![CDATA[<p>Dólar &amp; juros:&nbsp;<b>sobem</b></p>]]>")).toBe(
      "Dólar & juros: sobem",
    );
  });

  it("entende entidades numéricas", () => {
    expect(limparHtml("a&#8211;b &#x2014; c")).toBe("a–b — c");
  });

  it("deixa entidade desconhecida como está", () => {
    expect(limparHtml("x &inventada; y")).toBe("x &inventada; y");
  });
});

describe("cortar e contarPalavras", () => {
  it("corta com reticências e não passa do máximo", () => {
    expect(cortar("abcdefghij", 5)).toBe("abcd…");
    expect(cortar("abc", 5)).toBe("abc");
    expect(cortar("abcdefghij", 5).length).toBe(5);
  });

  it("conta palavras ignorando pontuação solta", () => {
    expect(contarPalavras("O dólar  fechou — em R$ 5,20.")).toBe(6);
    expect(contarPalavras("")).toBe(0);
  });
});

describe("urlCanonica", () => {
  it("tira rastreio e fragmento, sobe para https e normaliza o host", () => {
    expect(urlCanonica("http://G1.Globo.com/a/b?utm_source=x&id=7&fbclid=y#topo")).toBe(
      "https://g1.globo.com/a/b?id=7",
    );
  });

  it("recusa o que não é URL web", () => {
    expect(urlCanonica("javascript:alert(1)")).toBeNull();
    expect(urlCanonica("ftp://x.com/a")).toBeNull();
    expect(urlCanonica("não é url")).toBeNull();
  });

  it("duas formas da mesma URL viram uma só", () => {
    expect(urlCanonica("https://a.com/x?utm_medium=z")).toBe(urlCanonica("http://a.com/x#y"));
  });
});

describe("pertenceAoDominio", () => {
  const lista = ["g1.globo.com", "bbc.co.uk"];

  it("aceita o domínio e seus subdomínios", () => {
    expect(pertenceAoDominio("g1.globo.com", lista)).toBe(true);
    expect(pertenceAoDominio("www.bbc.co.uk", lista)).toBe(true);
  });

  it("recusa domínios parecidos", () => {
    expect(pertenceAoDominio("evilg1.globo.com", lista)).toBe(false);
    expect(pertenceAoDominio("g1.globo.com.golpe.net", lista)).toBe(false);
    expect(pertenceAoDominio("globo.com", lista)).toBe(false);
  });

  it("hostDe devolve o host ou nulo", () => {
    expect(hostDe("https://Exemplo.com/a")).toBe("exemplo.com");
    expect(hostDe("lixo")).toBeNull();
  });
});

describe("fuso de São Paulo", () => {
  it("a data muda às 00:00 de São Paulo, não às 00:00 UTC", () => {
    expect(dataEmSaoPaulo(new Date("2026-11-05T01:00:00Z"))).toBe("2026-11-04");
    expect(dataEmSaoPaulo(new Date("2026-11-05T03:00:00Z"))).toBe("2026-11-05");
    expect(mesEmSaoPaulo(new Date("2026-12-01T02:00:00Z"))).toBe("2026-11");
  });

  it("calcula o deslocamento pelo fuso, sem número fixo", () => {
    expect(offsetDeSaoPaulo(new Date("2026-11-04T12:00:00Z"))).toBe("-03:00");
  });

  it("monta o instante ISO a partir de data e hora locais", () => {
    expect(isoDeSaoPaulo("2026-11-04", "09:00")).toBe("2026-11-04T09:00:00-03:00");
    expect(isoDeSaoPaulo("2026-11-04", "23:59:00")).toBe("2026-11-04T23:59:00-03:00");
  });
});
