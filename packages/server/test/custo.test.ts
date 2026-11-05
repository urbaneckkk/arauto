import type { UsoDeModelo } from "@arauto/core";
import { describe, expect, it } from "vitest";
import { lerEnv } from "../src/config/env.js";
import { Orcamento, OrcamentoEsgotado } from "../src/custo/orcamento.js";
import {
  calcularUsd,
  estimarPiorCasoUsd,
  estimarTokens,
  ModeloSemPreco,
  USD_POR_BUSCA,
} from "../src/custo/precos.js";

const uso = (usd: number, buscas = 0): UsoDeModelo => ({
  modelo: "claude-sonnet-5-5",
  tokensEntrada: 0,
  tokensSaida: 0,
  tokensCacheLeitura: 0,
  buscas,
  usd,
});

describe("calcularUsd", () => {
  it("Sonnet 5.5: US$ 2 de entrada e US$ 10 de saída por milhão", () => {
    const usd = calcularUsd("claude-sonnet-5-5", {
      tokensEntrada: 22_000,
      tokensSaida: 8_000,
      tokensCacheLeitura: 0,
      buscas: 0,
    });
    expect(usd).toBeCloseTo(0.124, 6); // 0,044 + 0,080
  });

  it("Haiku 5.5: US$ 0,10 de entrada e US$ 0,50 de saída por milhão", () => {
    const usd = calcularUsd("claude-haiku-5-5", {
      tokensEntrada: 10_000,
      tokensSaida: 5_000,
      tokensCacheLeitura: 0,
      buscas: 0,
    });
    expect(usd).toBeCloseTo(0.0035, 6); // 0,001 + 0,0025
  });

  it("Haiku 5.5 acima de 100 mil tokens de prompt usa a faixa mais cara", () => {
    const usd = calcularUsd("claude-haiku-5-5", {
      tokensEntrada: 200_000,
      tokensSaida: 1_000,
      tokensCacheLeitura: 0,
      buscas: 0,
    });
    expect(usd).toBeCloseTo(0.1 + 0.0025, 6); // 200k × 0,50/M + 1k × 2,50/M
  });

  it("cada busca custa US$ 0,01", () => {
    const usd = calcularUsd("claude-sonnet-5-5", {
      tokensEntrada: 0,
      tokensSaida: 0,
      tokensCacheLeitura: 0,
      buscas: 8,
    });
    expect(usd).toBeCloseTo(8 * USD_POR_BUSCA, 6);
  });

  it("leitura de cache custa 10% da entrada", () => {
    const usd = calcularUsd("claude-sonnet-5-5", {
      tokensEntrada: 0,
      tokensSaida: 0,
      tokensCacheLeitura: 1_000_000,
      buscas: 0,
    });
    expect(usd).toBeCloseTo(0.2, 6);
  });

  it("modelo sem preço cadastrado é erro, nunca custo zero", () => {
    expect(() =>
      calcularUsd("modelo-novo", {
        tokensEntrada: 1,
        tokensSaida: 1,
        tokensCacheLeitura: 0,
        buscas: 0,
      }),
    ).toThrow(ModeloSemPreco);
  });

  it("o pior caso inclui a saída máxima e todas as buscas", () => {
    const pior = estimarPiorCasoUsd(
      "claude-sonnet-5-5",
      estimarTokens("x".repeat(30_000)),
      4_000,
      3,
    );
    // 10 mil tokens de entrada (0,02) + 4 mil de saída (0,04) + 3 buscas (0,03)
    expect(pior).toBeCloseTo(0.09, 6);
  });
});

describe("Orcamento (travas de custo)", () => {
  const base = { maxExecucaoUsd: 1, maxMesUsd: 25, gastoDoMesAntesUsd: 0, pausado: false };

  it("deixa passar uma chamada dentro das travas", () => {
    const orcamento = new Orcamento(base);
    expect(() => orcamento.verificarAntes(0.5)).not.toThrow();
  });

  it("para quando o pior caso passa da trava por execução", () => {
    const orcamento = new Orcamento(base);
    orcamento.registrar(uso(0.7));
    expect(() => orcamento.verificarAntes(0.4)).toThrow(OrcamentoEsgotado);
    try {
      orcamento.verificarAntes(0.4);
    } catch (erro) {
      expect((erro as OrcamentoEsgotado).motivo).toBe("execucao");
    }
  });

  it("para quando o mês estouraria, mesmo que a execução esteja dentro da trava", () => {
    const orcamento = new Orcamento({ ...base, gastoDoMesAntesUsd: 24.8 });
    try {
      orcamento.verificarAntes(0.5);
      expect.unreachable();
    } catch (erro) {
      expect((erro as OrcamentoEsgotado).motivo).toBe("mes");
    }
  });

  it("o interruptor geral bloqueia tudo", () => {
    const orcamento = new Orcamento({ ...base, pausado: true });
    try {
      orcamento.verificarAntes(0.0001);
      expect.unreachable();
    } catch (erro) {
      expect((erro as OrcamentoEsgotado).motivo).toBe("pausado");
    }
  });

  it("a reserva dos briefings diários protege o mês das atualizações", () => {
    // Teto de 25, reserva de 13: a atualização só pode levar o mês até 12.
    const orcamento = new Orcamento({ ...base, gastoDoMesAntesUsd: 11.6, reservaUsd: 13 });
    expect(() => orcamento.verificarAntes(0.4)).not.toThrow(); // 12,0
    try {
      orcamento.verificarAntes(0.5); // 12,1 invade a reserva
      expect.unreachable();
    } catch (erro) {
      expect((erro as OrcamentoEsgotado).motivo).toBe("reserva");
      expect((erro as OrcamentoEsgotado).message).toContain("reserva");
    }
  });

  it("sem reserva (o briefing das 06:00), o mês pode ir até o teto", () => {
    const orcamento = new Orcamento({ ...base, gastoDoMesAntesUsd: 24.2 });
    expect(() => orcamento.verificarAntes(0.8)).not.toThrow(); // 25,0
  });

  it("a trava do teto vale antes da da reserva", () => {
    const orcamento = new Orcamento({ ...base, gastoDoMesAntesUsd: 24.8, reservaUsd: 13 });
    try {
      orcamento.verificarAntes(0.5);
      expect.unreachable();
    } catch (erro) {
      expect((erro as OrcamentoEsgotado).motivo).toBe("mes");
    }
  });

  it("acumula o gasto e as buscas da execução", () => {
    const orcamento = new Orcamento(base);
    orcamento.registrar(uso(0.12, 2));
    orcamento.registrar(uso(0.3, 3));
    expect(orcamento.gastoDaExecucaoUsd).toBeCloseTo(0.42, 6);
    expect(orcamento.buscasDaExecucao).toBe(5);
    expect(orcamento.todosOsUsos).toHaveLength(2);
  });

  it("não perde centavos por erro de ponto flutuante", () => {
    const orcamento = new Orcamento(base);
    for (let i = 0; i < 10; i++) orcamento.registrar(uso(0.1));
    expect(orcamento.gastoDaExecucaoUsd).toBe(1);
  });
});

describe("lerEnv (servidor)", () => {
  it("padrões seguros: sem confiar em proxy, 3 atualizações por dia, agendador ligado", () => {
    const env = lerEnv({});
    expect(env).toMatchObject({
      PORT: 3000,
      CONFIAR_PROXY_SALTOS: 0,
      ATUALIZACOES_POR_DIA: 3,
      INTERVALO_ATUALIZACAO_MIN: 30,
      TOKEN_INATIVO_DIAS: 90,
      AGENDADOR_LIGADO: true,
      ORIGENS_PERMITIDAS: [],
    });
  });

  it("lê a lista de origens e o interruptor do agendador", () => {
    const env = lerEnv({
      ORIGENS_PERMITIDAS: " https://a.example , ,https://b.example ",
      AGENDADOR_LIGADO: "0",
      PORT: "8080",
      CONFIAR_PROXY_SALTOS: "1",
    });
    expect(env.ORIGENS_PERMITIDAS).toEqual(["https://a.example", "https://b.example"]);
    expect(env.AGENDADOR_LIGADO).toBe(false);
    expect(env.PORT).toBe(8080);
    expect(env.CONFIAR_PROXY_SALTOS).toBe(1);
  });

  it("recusa valores absurdos", () => {
    expect(() => lerEnv({ PORT: "0" })).toThrow();
    expect(() => lerEnv({ PORT: "70000" })).toThrow();
    expect(() => lerEnv({ CONFIAR_PROXY_SALTOS: "9" })).toThrow();
    expect(() => lerEnv({ ATUALIZACOES_POR_DIA: "0" })).toThrow();
  });
});

describe("lerEnv", () => {
  it("usa os padrões do briefing: US$ 1 por execução e US$ 25 por mês", () => {
    const env = lerEnv({});
    expect(env.MAX_USD_POR_EXECUCAO).toBe(1);
    expect(env.MAX_USD_MES).toBe(25);
    expect(env.PERFIL_CUSTO).toBe("padrao");
    expect(env.GASTOS_PAUSADOS).toBe(false);
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("valor vazio conta como ausente", () => {
    expect(
      lerEnv({ ANTHROPIC_API_KEY: "", DATABASE_URL: "   " }).ANTHROPIC_API_KEY,
    ).toBeUndefined();
  });

  it("lê números e o interruptor", () => {
    const env = lerEnv({ MAX_USD_MES: "40", GASTOS_PAUSADOS: "1", PERFIL_CUSTO: "economico" });
    expect(env.MAX_USD_MES).toBe(40);
    expect(env.GASTOS_PAUSADOS).toBe(true);
    expect(env.PERFIL_CUSTO).toBe("economico");
  });

  it("recusa valor inválido com mensagem clara", () => {
    expect(() => lerEnv({ MAX_USD_MES: "muito" })).toThrow(/MAX_USD_MES/);
    expect(() => lerEnv({ PERFIL_CUSTO: "luxo" })).toThrow(/PERFIL_CUSTO/);
    expect(() => lerEnv({ MAX_USD_POR_EXECUCAO: "-1" })).toThrow(/MAX_USD_POR_EXECUCAO/);
  });
});
