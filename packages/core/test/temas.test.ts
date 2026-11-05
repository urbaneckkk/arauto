import { describe, expect, it } from "vitest";
import {
  IntensidadeSchema,
  NotificacaoSchema,
  normalizarTemaId,
  PropostaDeTemaSchema,
  TEMA_IDS,
  TEMA_PADRAO,
  TemaIdSchema,
  ThemeMetaSchema,
} from "../src/index.js";
import { sinaisNeutros } from "./fixtures.js";

describe("catálogo de temas", () => {
  it("tem exatamente os 15 temas do briefing", () => {
    // Lista escrita à mão, de propósito: é o oráculo independente do briefing original.
    const esperado = [
      "neutro",
      "ternura_animal",
      "conflito",
      "nuclear",
      "clima_extremo",
      "mercado_alta",
      "mercado_queda",
      "ciencia_espaco",
      "tecnologia_ia",
      "agro_safra",
      "politica",
      "saude",
      "esporte",
      "cultura",
      "luto",
    ];
    expect([...TEMA_IDS].sort()).toEqual([...esperado].sort());
    expect(TEMA_IDS).toHaveLength(15);
  });

  it("o tema padrão é neutro e está no catálogo", () => {
    expect(TEMA_PADRAO).toBe("neutro");
    expect(TemaIdSchema.safeParse(TEMA_PADRAO).success).toBe(true);
  });

  it.each(["luto", "nuclear", "ternura_animal"])("aceita o id %s", (id) => {
    expect(normalizarTemaId(id)).toBe(id);
  });

  it.each([
    ["id inventado", "tema_que_nao_existe"],
    ["maiúsculas", "LUTO"],
    ["vazio", ""],
    ["nulo", null],
    ["indefinido", undefined],
    ["número", 42],
    ["objeto", { id: "luto" }],
  ])("tema desconhecido cai em neutro sem erro (%s)", (_nome, valor) => {
    expect(normalizarTemaId(valor)).toBe("neutro");
  });
});

describe("intensidade", () => {
  it.each([1, 2, 3])("aceita %i", (valor) => {
    expect(IntensidadeSchema.safeParse(valor).success).toBe(true);
  });

  it.each([0, 4, -1, 1.5, "2"])("recusa %s", (valor) => {
    expect(IntensidadeSchema.safeParse(valor).success).toBe(false);
  });
});

describe("notificação", () => {
  it("aceita título de 40 e corpo de 110 caracteres", () => {
    expect(
      NotificacaoSchema.safeParse({ titulo: "t".repeat(40), corpo: "c".repeat(110) }).success,
    ).toBe(true);
  });

  it("recusa título de 41 caracteres", () => {
    expect(NotificacaoSchema.safeParse({ titulo: "t".repeat(41), corpo: "ok" }).success).toBe(
      false,
    );
  });

  it("recusa corpo de 111 caracteres", () => {
    expect(NotificacaoSchema.safeParse({ titulo: "ok", corpo: "c".repeat(111) }).success).toBe(
      false,
    );
  });

  it("recusa texto vazio", () => {
    expect(NotificacaoSchema.safeParse({ titulo: "", corpo: "ok" }).success).toBe(false);
    expect(NotificacaoSchema.safeParse({ titulo: "ok", corpo: "" }).success).toBe(false);
  });
});

describe("proposta de tema (saída crua do modelo)", () => {
  const base = {
    id: "luto",
    intensidade: 3,
    confianca: 0.95,
    motivo: "Desastre com muitas vítimas.",
    notificacao: { titulo: "Tragédia no litoral", corpo: "Dezenas de vítimas." },
    sinais: sinaisNeutros(),
  };

  it("aceita id fora do catálogo, para o código normalizar para neutro", () => {
    const proposta = PropostaDeTemaSchema.safeParse({ ...base, id: "tema_inventado" });
    expect(proposta.success).toBe(true);
    if (proposta.success) {
      expect(normalizarTemaId(proposta.data.id)).toBe("neutro");
    }
  });

  it("recusa ficha de sinais incompleta", () => {
    const resultado = PropostaDeTemaSchema.safeParse({ ...base, sinais: { perdaDeVidas: true } });
    expect(resultado.success).toBe(false);
  });

  it("recusa confiança fora de 0 a 1", () => {
    expect(PropostaDeTemaSchema.safeParse({ ...base, confianca: 1.2 }).success).toBe(false);
  });
});

describe("meta.json de tema", () => {
  const base = {
    id: "neutro",
    nome: "Sala de Comando",
    intensidades: [1, 2, 3],
    som: true,
    emoji: "🛰️",
    duracaoAberturaMs: 2000,
  };

  it("aceita um meta válido", () => {
    expect(ThemeMetaSchema.safeParse(base).success).toBe(true);
  });

  it("o tema luto nunca tem som", () => {
    expect(ThemeMetaSchema.safeParse({ ...base, id: "luto", som: true }).success).toBe(false);
    expect(ThemeMetaSchema.safeParse({ ...base, id: "luto", som: false }).success).toBe(true);
  });

  it("abertura precisa durar de 1,5 a 2,5 segundos", () => {
    expect(ThemeMetaSchema.safeParse({ ...base, duracaoAberturaMs: 1499 }).success).toBe(false);
    expect(ThemeMetaSchema.safeParse({ ...base, duracaoAberturaMs: 1500 }).success).toBe(true);
    expect(ThemeMetaSchema.safeParse({ ...base, duracaoAberturaMs: 2500 }).success).toBe(true);
    expect(ThemeMetaSchema.safeParse({ ...base, duracaoAberturaMs: 2501 }).success).toBe(false);
  });

  it("recusa id fora do catálogo, intensidades vazias ou repetidas", () => {
    expect(ThemeMetaSchema.safeParse({ ...base, id: "outro" }).success).toBe(false);
    expect(ThemeMetaSchema.safeParse({ ...base, intensidades: [] }).success).toBe(false);
    expect(ThemeMetaSchema.safeParse({ ...base, intensidades: [2, 2] }).success).toBe(false);
  });
});
