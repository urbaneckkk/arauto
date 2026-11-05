import assert from "node:assert/strict";
import { test } from "node:test";
import { montarSite, podarEstado, registroPublico, ultimasVersoes } from "./exportar-site.mjs";

const briefing = (titulo, tema = "neutro") => ({ historiaDoDia: { titulo }, tema: { id: tema } });
const registro = (data, versao, titulo) => ({
  data,
  versao,
  execucaoId: "segredo-interno",
  tipo: "agendada",
  criadoEm: `${data}T09:30:00Z`,
  briefing: briefing(titulo),
  avisos: [],
});

test("fica só com a última versão de cada data, da mais nova para a mais antiga", () => {
  const lista = ultimasVersoes([
    registro("2026-11-03", 1, "a"),
    registro("2026-11-04", 1, "b1"),
    registro("2026-11-04", 2, "b2"),
  ]);
  assert.deepEqual(
    lista.map((r) => [r.data, r.versao]),
    [
      ["2026-11-04", 2],
      ["2026-11-03", 1],
    ],
  );
});

test("limita a quantidade de dias e ignora registros quebrados", () => {
  const lista = ultimasVersoes(
    [registro("2026-11-01", 1, "a"), registro("2026-11-02", 1, "b"), { data: "ontem" }, null, {}],
    1,
  );
  assert.equal(lista.length, 1);
  assert.equal(lista[0].data, "2026-11-02");
});

test("o registro público não leva o id da execução", () => {
  const publico = registroPublico(registro("2026-11-04", 1, "x"));
  assert.equal("execucaoId" in publico, false);
  assert.deepEqual(Object.keys(publico).sort(), [
    "avisos",
    "briefing",
    "criadoEm",
    "data",
    "versao",
  ]);
});

test("monta ultimo, indice e um arquivo por dia", () => {
  const site = montarSite({
    briefings: [registro("2026-11-03", 1, "a"), registro("2026-11-04", 1, "b")],
  });
  assert.deepEqual([...site.keys()].sort(), [
    "2026-11-03.json",
    "2026-11-04.json",
    "indice.json",
    "ultimo.json",
  ]);
  assert.equal(site.get("ultimo.json").data, "2026-11-04");
  assert.deepEqual(site.get("indice.json"), [
    { data: "2026-11-04", titulo: "b", tema: "neutro", versao: 1 },
    { data: "2026-11-03", titulo: "a", tema: "neutro", versao: 1 },
  ]);
});

test("sem nenhum briefing, não existe ultimo.json e o índice é vazio", () => {
  const site = montarSite({ briefings: [] });
  assert.equal(site.has("ultimo.json"), false);
  assert.deepEqual(site.get("indice.json"), []);
});

test("podar tira a saída crua dos passos e guarda só as 7 últimas execuções", () => {
  const execucoes = Array.from({ length: 10 }, (_, n) => ({
    id: `e${n}`,
    criadaEm: `2026-11-${String(n + 1).padStart(2, "0")}T00:00:00Z`,
    passos: [
      { passo: "coleta", saida: { itens: ["texto protegido por direitos autorais"] }, usos: [] },
    ],
  }));
  const podado = podarEstado(
    { execucoes, usos: [], briefings: [] },
    new Date("2026-11-20T00:00:00Z"),
  );
  assert.equal(podado.execucoes.length, 7);
  assert.equal(JSON.stringify(podado).includes("direitos autorais"), false);
  assert.equal(podado.execucoes[0].passos[0].saida, null);
});

test("podar guarda os gastos recentes (a trava mensal precisa deles) e descarta os muito antigos", () => {
  const agora = new Date("2026-11-20T00:00:00Z");
  const podado = podarEstado(
    {
      execucoes: [],
      briefings: [],
      usos: [
        { quando: "2026-11-19T10:00:00Z", uso: { usd: 0.2 } },
        { quando: "2026-10-01T10:00:00Z", uso: { usd: 0.3 } },
        { quando: "2026-06-01T10:00:00Z", uso: { usd: 9 } },
      ],
    },
    agora,
  );
  assert.deepEqual(
    podado.usos.map((u) => u.uso.usd),
    [0.2, 0.3],
  );
});

test("podar mantém só a última versão de cada dia e no máximo 60 dias de briefings", () => {
  const dias = Array.from({ length: 70 }, (_, n) =>
    new Date(Date.UTC(2026, 0, 1 + n)).toISOString().slice(0, 10),
  );
  const maisNovo = dias[69];
  const briefings = [registro(maisNovo, 2, "nova"), ...dias.map((dia) => registro(dia, 1, "x"))];
  const podado = podarEstado({ execucoes: [], usos: [], briefings });
  assert.equal(podado.briefings.length, 60);
  assert.equal(podado.briefings[0].data, maisNovo);
  assert.equal(podado.briefings[0].versao, 2);
  assert.equal(podado.briefings.at(-1).data, dias[10]);
});
