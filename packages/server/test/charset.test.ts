import { describe, expect, it } from "vitest";
import { lerFeed } from "../src/coleta/rss.js";
import { decodificarCorpo } from "../src/infra/transporte.js";

/** Codifica um texto em ISO-8859-1 (um byte por caractere), como o feed da Folha. */
function latin1(texto: string): Uint8Array {
  return Uint8Array.from(texto, (c) => c.charCodeAt(0));
}

const utf8 = (texto: string) => new TextEncoder().encode(texto);

describe("decodificarCorpo", () => {
  const prologoIso = '<?xml version="1.0" encoding="ISO-8859-1" ?>';

  it("usa a declaração do XML quando o cabeçalho não diz o charset (caso da Folha)", () => {
    const xml = `${prologoIso}<rss><channel><item><title>Governo define alíquotas e propõe manutenção</title></item></channel></rss>`;
    expect(decodificarCorpo(latin1(xml), "text/xml")).toContain("alíquotas e propõe manutenção");
  });

  it("sem tratamento, o mesmo corpo viraria caractere quebrado (prova do bug original)", () => {
    const bytes = latin1(`${prologoIso}<t>alíquotas</t>`);
    expect(new TextDecoder("utf-8").decode(bytes)).toContain("al�quotas");
  });

  it("o charset do cabeçalho HTTP vence o da declaração do XML", () => {
    const bytes = utf8('<?xml version="1.0" encoding="ISO-8859-1"?><t>açúcar</t>');
    expect(decodificarCorpo(bytes, "application/xml; charset=UTF-8")).toContain("açúcar");
  });

  it("charset com aspas e maiúsculas no cabeçalho também funciona", () => {
    expect(decodificarCorpo(latin1("<t>ação</t>"), 'text/xml; Charset="ISO-8859-1"')).toContain(
      "ação",
    );
  });

  it("sem charset nenhum, é UTF-8 (e o BOM some)", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8("<t>coração</t>")]);
    expect(decodificarCorpo(bytes, null)).toBe("<t>coração</t>");
  });

  it("charset desconhecido cai em UTF-8 sem lançar erro", () => {
    expect(decodificarCorpo(utf8("<t>não</t>"), "text/xml; charset=inventado-9000")).toBe(
      "<t>não</t>",
    );
  });

  it("windows-1252 (aspas curvas e travessão) também é entendido", () => {
    const bytes = Uint8Array.from([
      0x3c, 0x74, 0x3e, 0x93, 0x6f, 0x6b, 0x94, 0x20, 0x96, 0x3c, 0x2f, 0x74, 0x3e,
    ]);
    expect(decodificarCorpo(bytes, "text/xml; charset=windows-1252")).toBe("<t>“ok” –</t>");
  });
});

describe("feed ISO-8859-1 de ponta a ponta", () => {
  it("o título sai com acento certo depois de decodificar e ler o feed", () => {
    const xml =
      '<?xml version="1.0" encoding="ISO-8859-1" ?><rss version="2.0"><channel><item>' +
      "<title>Flávio Bolsonaro registra presença em sessão</title><link>https://exemplo.com/a</link>" +
      "<pubDate>Thu, 05 Nov 2026 05:00:00 +0000</pubDate></item></channel></rss>";
    const [item] = lerFeed(decodificarCorpo(latin1(xml), "text/xml"));
    expect(item?.titulo).toBe("Flávio Bolsonaro registra presença em sessão");
    expect(item?.titulo).not.toContain("�");
  });
});
