import { describe, expect, it } from "vitest";
import type { ItemColetado } from "../src/coleta/tipos.js";
import { logSilencioso } from "../src/infra/log.js";
import { RespostaInvalida } from "../src/modelos/cliente.js";
import { ClienteFalso, respostaDeTexto } from "../src/modelos/falso.js";
import {
  executarTermometro,
  ITENS_PARA_EXIGIR_QUALIDADE,
  MIN_ACONTECIMENTOS,
  normalizarId,
} from "../src/passos/termometro.js";
import { semPausa } from "../src/passos/tipos.js";
import { transporteDeMapa } from "./ajudantes.js";
import { AGORA, HAIKU, relogio } from "./mundo.js";

const ids = (quantos: number) =>
  Array.from({ length: quantos }, (_, i) => `i${String(i + 1).padStart(3, "0")}`);

function itensDeTeste(quantos: number): ItemColetado[] {
  return ids(quantos).map((id, i) => ({
    id,
    feedId: "teste",
    veiculo: `Veículo ${i % 5}`,
    pais: "BR",
    idioma: "pt" as const,
    titulo: `Fato inventado ${i + 1}`,
    url: `https://g1.globo.com/teste/${id}`,
    publicadoEm: new Date(AGORA.getTime() - (i % 20) * 3_600_000).toISOString(),
    resumo: "",
  }));
}

const agrupamento = (acontecimentos: object[]) =>
  respostaDeTexto(HAIKU, JSON.stringify({ acontecimentos }));

async function rodar(itens: ItemColetado[], cliente: ClienteFalso) {
  return executarTermometro(
    {
      cliente,
      transporte: transporteDeMapa({}),
      relogio,
      log: logSilencioso,
      modelo: HAIKU,
      pausa: semPausa,
    },
    itens,
  );
}

describe("normalizarId", () => {
  it.each([
    ["i015", "i015"],
    ["015", "i015"],
    ["15", "i015"],
    [" I007 ", "i007"],
    ["i1234", "i1234"],
    ["w01", "w01"],
    ["i", "i"],
    ["lixo", "lixo"],
  ])("%s → %s", (entrada, esperado) => {
    expect(normalizarId(entrada)).toBe(esperado);
  });
});

describe("portão de qualidade do termômetro (aprendido na 2ª execução real)", () => {
  const itens = itensDeTeste(ITENS_PARA_EXIGIR_QUALIDADE + 20);

  /** Reproduz a resposta degenerada que o Haiku deu: 1 grupo, ids sem prefixo e repetidos. */
  const degenerada = agrupamento([
    {
      titulo: "Tudo junto",
      categoria: "politica",
      itens: ["015", "106", "108", "i"],
      consultaGdelt: "x",
    },
    {
      titulo: "Tudo junto",
      categoria: "politica",
      itens: ["i015", "i106", "i108"],
      consultaGdelt: "x",
    },
  ]);

  const boa = () =>
    agrupamento(
      Array.from({ length: 24 }, (_, g) => ({
        titulo: `Acontecimento ${g + 1}`,
        categoria: g % 2 === 0 ? "politica" : "economia",
        itens: ids(itens.length).slice(g * 5, g * 5 + 5),
        consultaGdelt: `evento ${g}`,
      })),
    );

  it("recusa agrupamento pobre com bastante material (o passo será repetido)", async () => {
    await expect(rodar(itens, new ClienteFalso({ termometro: degenerada }))).rejects.toThrow(
      RespostaInvalida,
    );
    await expect(rodar(itens, new ClienteFalso({ termometro: degenerada }))).rejects.toThrow(
      /agrupamento pobre/,
    );
  });

  it("aceita um agrupamento com acontecimentos e cobertura suficientes", async () => {
    const resultado = await rodar(itens, new ClienteFalso({ termometro: boa() }));
    expect(resultado.clusters.length).toBeGreaterThanOrEqual(MIN_ACONTECIMENTOS);
  });

  it("recusa muitos acontecimentos que cobrem quase nenhum item", async () => {
    const rala = agrupamento(
      Array.from({ length: 20 }, (_, g) => ({
        titulo: `Grupo ${g}`,
        categoria: "politica",
        itens: [ids(itens.length)[g]],
        consultaGdelt: "x",
      })),
    );
    await expect(rodar(itens, new ClienteFalso({ termometro: rala }))).rejects.toThrow(
      /cobrindo 17%/,
    );
  });

  it("com pouco material (poucas manchetes), o portão não vale", async () => {
    const poucos = itensDeTeste(30);
    const resultado = await rodar(
      poucos,
      new ClienteFalso({
        termometro: agrupamento([
          { titulo: "Único", categoria: "politica", itens: ["i001", "i002"], consultaGdelt: "x" },
        ]),
      }),
    );
    expect(resultado.clusters).toHaveLength(1);
  });

  it("aceita ids sem o prefixo i (015, 15) e não duplica item entre grupos", async () => {
    const resultado = await rodar(
      itensDeTeste(30),
      new ClienteFalso({
        termometro: agrupamento([
          { titulo: "A", categoria: "politica", itens: ["001", "i002", "3"], consultaGdelt: "a" },
          { titulo: "B", categoria: "economia", itens: ["i003", "004"], consultaGdelt: "b" },
        ]),
      }),
    );
    const a = resultado.clusters.find((c) => c.titulo === "A");
    const b = resultado.clusters.find((c) => c.titulo === "B");
    expect(a?.itens.map((i) => i.id)).toEqual(["i001", "i002", "i003"]);
    expect(b?.itens.map((i) => i.id)).toEqual(["i004"]);
  });

  it("o termômetro roda com esforço médio (low oscilou na execução real)", async () => {
    const cliente = new ClienteFalso({ termometro: boa() });
    await rodar(itens, cliente);
    expect(cliente.chamadas[0]?.esforco).toBe("medium");
  });
});
