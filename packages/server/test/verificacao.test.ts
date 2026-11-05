import { describe, expect, it } from "vitest";
import { logSilencioso } from "../src/infra/log.js";
import type { Redacao } from "../src/passos/redacao.js";
import type { ItemDeMaterial } from "../src/passos/tipos.js";
import {
  ErroDeVerificacao,
  temTrechoCopiado,
  verificarRedacao,
} from "../src/passos/verificacao.js";
import { transporteDeMapa } from "./ajudantes.js";
import { AGORA, haAlgumasHoras, relogio } from "./mundo.js";

const instante = (horasAtras: number) =>
  new Date(AGORA.getTime() - horasAtras * 3_600_000).toISOString();

const item = (id: string, extras: Partial<ItemDeMaterial> = {}): ItemDeMaterial => ({
  id,
  feedId: "teste",
  veiculo: "g1",
  pais: "BR",
  idioma: "pt",
  titulo: `Título do item ${id}`,
  url: `https://g1.globo.com/politica/${id}`,
  publicadoEm: instante(2),
  resumo: "",
  origem: "feed",
  ...extras,
});

const registro = (...itens: ItemDeMaterial[]) => new Map(itens.map((i) => [i.id, i]));

const noticia = (fontes: string[], extras: Record<string, unknown> = {}) => ({
  titulo: "Título da notícia",
  oQueAconteceu: "Texto próprio da primeira parte. Com mais uma frase própria.",
  porQueImporta: "Texto próprio da segunda parte.",
  lados: [],
  continuaDeOntem: null,
  fontes,
  importancia: 3,
  ...extras,
});

const redacao = (extras: Partial<Redacao> = {}): Redacao => ({
  historiaDoDia: { titulo: "História", resumo: "Resumo." },
  emTrintaSegundos: ["a", "b", "c"],
  tempoResumo: "Dia normal.",
  secoes: [{ id: "politica", noticias: [noticia(["i1"])] }],
  curiosidade: null,
  ...extras,
});

async function verificar(
  r: Redacao,
  itens: ItemDeMaterial[],
  verificacoes: Parameters<typeof transporteDeMapa>[1] = {},
) {
  const transporte = transporteDeMapa({}, verificacoes);
  const resultado = await verificarRedacao(
    { transporte, relogio, log: logSilencioso },
    r,
    registro(...itens),
  );
  return { resultado, transporte };
}

describe("verificação de fontes (passo 5)", () => {
  it("aprova uma fonte válida e publica título, URL e data do item", async () => {
    const { resultado } = await verificar(redacao(), [item("i1")]);
    const fonte = resultado.secoes[0]?.noticias[0]?.fontes[0];
    expect(fonte).toEqual({
      titulo: "Título do item i1",
      url: "https://g1.globo.com/politica/i1",
      publicadoEm: instante(2),
    });
    expect(resultado.fontesVerificadas).toBe(1);
  });

  it("identificador que não existe no material não vira fonte (proteção contra link inventado)", async () => {
    const r = redacao({
      secoes: [
        { id: "politica", noticias: [noticia(["i999"]), noticia(["i1"], { titulo: "Boa" })] },
      ],
    });
    const { resultado } = await verificar(r, [item("i1")]);
    expect(resultado.secoes[0]?.noticias.map((n) => n.titulo)).toEqual(["Boa"]);
    expect(resultado.descartes.some((d) => d.motivo.includes("i999 não existe"))).toBe(true);
  });

  it("recusa domínio fora da lista branca", async () => {
    const { resultado } = await verificar(
      redacao({ secoes: [{ id: "politica", noticias: [noticia(["i1"]), noticia(["i2"])] }] }),
      [item("i1", { url: "https://site-qualquer.com/a" }), item("i2")],
    );
    expect(resultado.secoes[0]?.noticias).toHaveLength(1);
    expect(resultado.descartes.some((d) => d.motivo.includes("lista branca"))).toBe(true);
  });

  it("recusa domínio parecido com um permitido", async () => {
    await expect(
      verificar(redacao(), [item("i1", { url: "https://g1.globo.com.golpe.net/a" })]),
    ).rejects.toThrow(ErroDeVerificacao);
  });

  it.each([
    ["velha (37 horas)", instante(37)],
    ["sem data", null],
    ["do futuro", instante(-5)],
  ])("recusa fonte com data %s", async (_nome, publicadoEm) => {
    await expect(verificar(redacao(), [item("i1", { publicadoEm })])).rejects.toThrow(
      ErroDeVerificacao,
    );
  });

  it("aceita fonte no limite das 36 horas", async () => {
    const { resultado } = await verificar(redacao(), [item("i1", { publicadoEm: instante(35.9) })]);
    expect(resultado.secoes).toHaveLength(1);
  });

  it.each([404, 500, 0])("recusa link que responde %i", async (status) => {
    await expect(
      verificar(redacao(), [item("i1")], { "https://g1.globo.com/politica/i1": status }),
    ).rejects.toThrow(/Nenhuma notícia sobreviveu/);
  });

  it("aceita redirecionamento (3xx) para o mesmo domínio", async () => {
    const { resultado } = await verificar(redacao(), [item("i1")], {
      "https://g1.globo.com/politica/i1": {
        status: 200,
        urlFinal: "https://g1.globo.com/politica/i1-novo",
      },
    });
    expect(resultado.secoes).toHaveLength(1);
  });

  describe("veículos que bloqueiam robôs", () => {
    it("Reuters e AP respondendo 401/403/429 contam como inconclusivo e passam", async () => {
      for (const [url, status] of [
        ["https://www.reuters.com/world/a", 401],
        ["https://apnews.com/article/b", 403],
        ["https://www.simepar.br/c", 429],
      ] as const) {
        const { resultado } = await verificar(redacao(), [item("i1", { url })], { [url]: status });
        expect(resultado.secoes, url).toHaveLength(1);
      }
    });

    it("o g1 respondendo 403 NÃO é inconclusivo: é recusado", async () => {
      await expect(
        verificar(redacao(), [item("i1")], { "https://g1.globo.com/politica/i1": 403 }),
      ).rejects.toThrow(ErroDeVerificacao);
    });

    it("Reuters respondendo 404 é recusado (só 401/403/429 são perdoados)", async () => {
      const url = "https://www.reuters.com/world/a";
      await expect(verificar(redacao(), [item("i1", { url })], { [url]: 404 })).rejects.toThrow(
        ErroDeVerificacao,
      );
    });
  });

  describe("links de redirecionamento da Folha", () => {
    const redir =
      "https://redir.folha.com.br/redir/online/mundo/rss091/*https://www1.folha.uol.com.br/mundo/2026/11/materia.shtml";

    it("publica a URL FINAL, depois do redirecionamento", async () => {
      const final = "https://www1.folha.uol.com.br/mundo/2026/11/materia.shtml";
      const { resultado } = await verificar(
        redacao(),
        [item("i1", { veiculo: "Folha", url: redir })],
        { [redir]: { status: 200, urlFinal: `${final}?utm_source=rss` } },
      );
      expect(resultado.secoes[0]?.noticias[0]?.fontes[0]?.url).toBe(final);
    });

    it("recusa se o redirecionamento termina fora da lista branca", async () => {
      await expect(
        verificar(redacao(), [item("i1", { url: redir })], {
          [redir]: { status: 200, urlFinal: "https://site-malicioso.com/golpe" },
        }),
      ).rejects.toThrow(ErroDeVerificacao);
    });

    it("recusa se a URL final do redirecionador é ela mesma (não saiu do redirecionador)", async () => {
      await expect(
        verificar(redacao(), [item("i1", { url: redir })], {
          [redir]: { status: 200, urlFinal: redir },
        }),
      ).rejects.toThrow(ErroDeVerificacao);
    });
  });

  it("com duas fontes, uma ruim e uma boa, mantém só a boa", async () => {
    const r = redacao({ secoes: [{ id: "politica", noticias: [noticia(["i1", "i2"])] }] });
    const { resultado } = await verificar(r, [item("i1"), item("i2")], {
      "https://g1.globo.com/politica/i1": 404,
    });
    expect(resultado.secoes[0]?.noticias[0]?.fontes.map((f) => f.titulo)).toEqual([
      "Título do item i2",
    ]);
  });

  it("confere cada link uma vez só, mesmo citado em várias notícias", async () => {
    const r = redacao({
      secoes: [{ id: "politica", noticias: [noticia(["i1"]), noticia(["i1"])] }],
    });
    const { transporte } = await verificar(r, [item("i1")]);
    expect(transporte.chamadas.filter((c) => c.startsWith("verificar"))).toHaveLength(1);
  });

  it("descarta notícia que copia um trecho de 8 palavras da matéria", async () => {
    const original =
      "A obra no bairro Alfa vai ocupar duas faixas da avenida principal durante todo o mês";
    const r = redacao({
      secoes: [
        {
          id: "politica",
          noticias: [
            noticia(["i1"], { oQueAconteceu: `Segundo a prefeitura, ${original}. Isso é tudo.` }),
            noticia(["i1"], {
              titulo: "Reescrita",
              oQueAconteceu: "A prefeitura vai fechar parte da via por quatro semanas.",
            }),
          ],
        },
      ],
    });
    const { resultado } = await verificar(r, [item("i1", { resumo: original })]);
    expect(resultado.secoes[0]?.noticias.map((n) => n.titulo)).toEqual(["Reescrita"]);
    expect(resultado.descartes.some((d) => d.motivo.includes("trecho copiado"))).toBe(true);
  });

  describe("limites do contrato", () => {
    const muitas = (quantas: number) =>
      Array.from({ length: quantas }, (_, i) => noticia(["i1"], { titulo: `N${i}` }));

    it("no máximo 4 notícias por seção", async () => {
      const { resultado } = await verificar(
        redacao({ secoes: [{ id: "politica", noticias: muitas(6) }] }),
        [item("i1")],
      );
      expect(resultado.secoes[0]?.noticias).toHaveLength(4);
    });

    it("teto global de 14 notícias, tirando da seção maior", async () => {
      const r = redacao({
        secoes: [
          { id: "politica", noticias: muitas(4) },
          { id: "economia", noticias: muitas(4) },
          { id: "agro", noticias: muitas(4) },
          { id: "mundo", noticias: muitas(4) },
        ],
      });
      const { resultado } = await verificar(r, [item("i1")]);
      expect(resultado.secoes.reduce((s, x) => s + x.noticias.length, 0)).toBe(14);
    });

    it("junta uma seção repetida pelo redator", async () => {
      const r = redacao({
        secoes: [
          { id: "politica", noticias: muitas(1) },
          { id: "politica", noticias: muitas(1) },
        ],
      });
      const { resultado } = await verificar(r, [item("i1")]);
      expect(resultado.secoes).toHaveLength(1);
      expect(resultado.secoes[0]?.noticias).toHaveLength(2);
    });

    it("seção que perdeu todas as notícias some do briefing", async () => {
      const r = redacao({
        secoes: [
          { id: "politica", noticias: [noticia(["i1"])] },
          { id: "economia", noticias: [noticia(["i999"])] },
        ],
      });
      const { resultado } = await verificar(r, [item("i1")]);
      expect(resultado.secoes.map((s) => s.id)).toEqual(["politica"]);
    });
  });

  it('exige exatamente 3 frases em "Em 30 segundos"', async () => {
    await expect(
      verificar(redacao({ emTrintaSegundos: ["a", "b"] }), [item("i1")]),
    ).rejects.toThrow(/exatamente 3/);
    await expect(
      verificar(redacao({ emTrintaSegundos: ["a", " ", "c"] }), [item("i1")]),
    ).rejects.toThrow(/exatamente 3/);
  });

  it("curiosidade sem fonte válida vira nula, sem derrubar o briefing", async () => {
    const r = redacao({ curiosidade: noticia(["i999"]) });
    const { resultado } = await verificar(r, [item("i1")]);
    expect(resultado.curiosidade).toBeNull();
    expect(resultado.secoes).toHaveLength(1);
  });

  it("curiosidade com fonte válida é mantida", async () => {
    const r = redacao({ curiosidade: noticia(["i2"], { titulo: "Curiosa" }) });
    const { resultado } = await verificar(r, [item("i1"), item("i2")]);
    expect(resultado.curiosidade?.titulo).toBe("Curiosa");
  });

  it("achado de busca com data conhecida passa; sem data, não", async () => {
    const comData = item("w01", {
      origem: "busca",
      url: "https://www.bbc.com/a",
      publicadoEm: haAlgumasHoras(2) && instante(2),
    });
    const semData = item("w02", {
      origem: "busca",
      url: "https://www.bbc.com/b",
      publicadoEm: null,
    });
    const r = redacao({
      secoes: [
        { id: "mundo", noticias: [noticia(["w01"]), noticia(["w02"], { titulo: "Sem data" })] },
      ],
    });
    const { resultado } = await verificar(r, [comData, semData]);
    expect(resultado.secoes[0]?.noticias).toHaveLength(1);
  });
});

describe("temTrechoCopiado", () => {
  const referencia =
    "o governo anunciou nesta terça um pacote de medidas para conter a alta dos preços e proteger o consumidor";

  it("acha 12 palavras seguidas iguais, ignorando maiúsculas e pontuação", () => {
    expect(
      temTrechoCopiado(
        "Foi assim: O governo anunciou, nesta terça, um pacote de medidas para conter a alta!",
        [referencia],
      ),
    ).toBe(true);
  });

  it("não acusa texto reescrito, nem 11 palavras seguidas", () => {
    expect(
      temTrechoCopiado("Medidas contra a alta de preços foram anunciadas pelo governo na terça.", [
        referencia,
      ]),
    ).toBe(false);
    // 11 palavras iguais, a 12ª muda.
    expect(
      temTrechoCopiado(
        "o governo anunciou nesta terça um pacote de medidas para conter ideias novas",
        [referencia],
      ),
    ).toBe(false);
  });

  it("fatos curtos inevitáveis (nome, número, lugar) não contam como cópia", () => {
    const resumo =
      "O líder do governo no Congresso, Randolfe Rodrigues, disse que o Ministério já recebeu mais de 7 mil denúncias de assédio eleitoral.";
    expect(
      temTrechoCopiado(
        "Segundo o líder do governo no Congresso, Randolfe Rodrigues, a pasta já recebeu mais de 7 mil denúncias de assédio eleitoral.",
        [resumo],
      ),
    ).toBe(false);
  });

  it("o tamanho do trecho pode ser informado", () => {
    expect(
      temTrechoCopiado("o governo anunciou nesta terça um pacote de medidas", [referencia], 8),
    ).toBe(true);
  });

  it("sem referência ou com referência curta, nunca acusa", () => {
    expect(temTrechoCopiado("qualquer texto aqui", [])).toBe(false);
    expect(temTrechoCopiado("qualquer texto aqui", ["curta"])).toBe(false);
  });
});

describe("corte por importância (as menos importantes saem primeiro)", () => {
  const comNota = (titulo: string, importancia: number) => noticia(["i1"], { titulo, importancia });
  const titulos = (resultado: Awaited<ReturnType<typeof verificar>>["resultado"]) =>
    resultado.secoes.flatMap((s) => s.noticias.map((n) => n.titulo));

  it("no máximo 4 por seção: sai a menos importante, não a última", async () => {
    const notas = [5, 1, 4, 2, 5, 3];
    const r = redacao({
      secoes: [{ id: "politica", noticias: notas.map((nota, i) => comNota(`N${i}`, nota)) }],
    });
    const { resultado } = await verificar(r, [item("i1")]);
    expect(titulos(resultado)).toEqual(["N0", "N2", "N4", "N5"]);
  });

  it("no teto global de 14: saem as de menor nota, em qualquer seção", async () => {
    const secao = (id: "politica" | "economia" | "agro" | "mundo", notas: number[]) => ({
      id,
      noticias: notas.map((nota, i) => comNota(`${id}-${i}`, nota)),
    });
    const r = redacao({
      secoes: [
        secao("politica", [1, 5, 5, 5]),
        secao("economia", [5, 5, 5, 5]),
        secao("agro", [5, 5, 5, 2]),
        secao("mundo", [5, 5, 5, 5]),
      ],
    });
    const { resultado } = await verificar(r, [item("i1")]);
    const mantidas = titulos(resultado);
    expect(mantidas).toHaveLength(14);
    expect(mantidas).not.toContain("politica-0");
    expect(mantidas).not.toContain("agro-3");
  });

  it("em empate de importância, sai a que vem mais tarde", async () => {
    const r = redacao({
      secoes: [{ id: "politica", noticias: [0, 1, 2, 3, 4, 5].map((i) => comNota(`N${i}`, 3)) }],
    });
    const { resultado } = await verificar(r, [item("i1")]);
    expect(titulos(resultado)).toEqual(["N0", "N1", "N2", "N3"]);
  });

  it("nota fora de 1 a 5 ou quebrada é ajustada, sem derrubar nada", async () => {
    const r = redacao({
      secoes: [
        {
          id: "politica",
          noticias: [
            comNota("A", 99),
            comNota("B", 0),
            comNota("C", 4.6),
            comNota("D", -3),
            comNota("E", 3),
          ],
        },
      ],
    });
    const { resultado } = await verificar(r, [item("i1")]);
    // A=5, B=1, C=5, D=1, E=3: sobram 4, saindo uma das notas 1 (a mais tardia, D).
    expect(titulos(resultado)).toEqual(["A", "B", "C", "E"]);
  });

  it("o motivo do descarte fica registrado", async () => {
    const r = redacao({
      secoes: [
        { id: "politica", noticias: [5, 5, 5, 5, 1].map((nota, i) => comNota(`N${i}`, nota)) },
      ],
    });
    const { resultado } = await verificar(r, [item("i1")]);
    expect(
      resultado.descartes.some((d) => d.onde.includes("N4") && d.motivo.includes("máximo")),
    ).toBe(true);
  });
});
