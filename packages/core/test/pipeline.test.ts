import { describe, expect, it } from "vitest";
import {
  ExecucaoSchema,
  jsonSchemaDoBriefing,
  MAX_TENTATIVAS_POR_PASSO,
  PASSOS,
  ResultadoPassoSchema,
  UsoDeModeloSchema,
} from "../src/index.js";

const passoOk = {
  passo: "coleta",
  status: "ok",
  tentativa: 1,
  iniciadoEm: "2026-11-04T06:00:00-03:00",
  terminadoEm: "2026-11-04T06:01:30-03:00",
  resumoEntrada: "12 feeds consultados",
  saida: { itens: 412 },
  erro: null,
  usos: [],
};

describe("passos do pipeline", () => {
  it("são 7, na ordem do briefing", () => {
    expect(PASSOS).toEqual([
      "coleta",
      "termometro",
      "apuracao",
      "redacao",
      "verificacao",
      "tema",
      "publicacao",
    ]);
  });

  it("aceita um resultado de passo válido", () => {
    expect(ResultadoPassoSchema.safeParse(passoOk).success).toBe(true);
  });

  it("passo com falha precisa de erro, e passo ok não pode ter erro", () => {
    expect(
      ResultadoPassoSchema.safeParse({ ...passoOk, status: "falha", erro: null }).success,
    ).toBe(false);
    expect(
      ResultadoPassoSchema.safeParse({ ...passoOk, status: "falha", erro: "timeout" }).success,
    ).toBe(true);
    expect(ResultadoPassoSchema.safeParse({ ...passoOk, erro: "algo" }).success).toBe(false);
  });

  it(`aceita até ${MAX_TENTATIVAS_POR_PASSO} tentativas por passo (1 + 2 repetições)`, () => {
    expect(
      ResultadoPassoSchema.safeParse({ ...passoOk, tentativa: MAX_TENTATIVAS_POR_PASSO }).success,
    ).toBe(true);
    expect(
      ResultadoPassoSchema.safeParse({ ...passoOk, tentativa: MAX_TENTATIVAS_POR_PASSO + 1 })
        .success,
    ).toBe(false);
    expect(ResultadoPassoSchema.safeParse({ ...passoOk, tentativa: 0 }).success).toBe(false);
  });

  it("recusa passo que termina antes de começar", () => {
    const invalido = { ...passoOk, terminadoEm: "2026-11-04T05:00:00-03:00" };
    expect(ResultadoPassoSchema.safeParse(invalido).success).toBe(false);
  });

  it("recusa passo desconhecido", () => {
    expect(ResultadoPassoSchema.safeParse({ ...passoOk, passo: "improviso" }).success).toBe(false);
  });
});

describe("uso de modelo (livro-caixa de custos)", () => {
  it("aceita um uso válido e recusa valores negativos", () => {
    const uso = {
      modelo: "claude-sonnet-5-5",
      tokensEntrada: 22000,
      tokensSaida: 8000,
      tokensCacheLeitura: 0,
      buscas: 0,
      usd: 0.124,
    };
    expect(UsoDeModeloSchema.safeParse(uso).success).toBe(true);
    expect(UsoDeModeloSchema.safeParse({ ...uso, usd: -1 }).success).toBe(false);
    expect(UsoDeModeloSchema.safeParse({ ...uso, tokensEntrada: 1.5 }).success).toBe(false);
  });
});

describe("execução", () => {
  const execucao = {
    id: "3f2b7c1e-8a4d-4e6f-9b0a-1c2d3e4f5a6b",
    data: "2026-11-04",
    tipo: "diaria",
    status: "ok",
    criadaEm: "2026-11-04T06:00:00-03:00",
    passos: [passoOk],
  };

  it("aceita uma execução válida", () => {
    expect(ExecucaoSchema.safeParse(execucao).success).toBe(true);
  });

  it("aceita o status abortado_por_custo e recusa status desconhecido", () => {
    expect(ExecucaoSchema.safeParse({ ...execucao, status: "abortado_por_custo" }).success).toBe(
      true,
    );
    expect(ExecucaoSchema.safeParse({ ...execucao, status: "talvez" }).success).toBe(false);
  });

  it("recusa id que não é UUID e tipo desconhecido", () => {
    expect(ExecucaoSchema.safeParse({ ...execucao, id: "123" }).success).toBe(false);
    expect(ExecucaoSchema.safeParse({ ...execucao, tipo: "manual" }).success).toBe(false);
  });
});

describe("JSON Schema do briefing", () => {
  const schema = jsonSchemaDoBriefing();

  it("descreve um objeto com os campos do contrato", () => {
    expect(schema.type).toBe("object");
    const propriedades = Object.keys(schema.properties ?? {});
    expect(propriedades).toEqual(
      expect.arrayContaining([
        "data",
        "historiaDoDia",
        "tema",
        "emTrintaSegundos",
        "tempo",
        "secoes",
        "curiosidade",
        "custo",
      ]),
    );
  });

  it("pontuacaoParcial não é obrigatória na entrada (tem valor padrão)", () => {
    const historia = schema.properties?.historiaDoDia as { required?: string[] } | undefined;
    expect(historia?.required).not.toContain("pontuacaoParcial");
  });

  it("serializa para JSON sem perder nada", () => {
    expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
  });
});
