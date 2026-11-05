import { describe, expect, it } from "vitest";
import { logSilencioso } from "../src/infra/log.js";
import { RepositorioEmMemoria } from "../src/repo/memoria.js";
import {
  Agendador,
  ESPERA_ENTRE_TENTATIVAS_MS,
  MAX_TENTATIVAS_DA_DIARIA,
} from "../src/servico/agendador.js";
import { type LimitesDoServico, Orquestrador } from "../src/servico/orquestrador.js";
import { executorFalso, relogioAjustavel } from "./ajudantes.js";

// 06:00 em São Paulo (UTC-3) de 5 de novembro de 2026.
const SEIS_DA_MANHA = "2026-11-05T09:00:00.000Z";

const limites: LimitesDoServico = {
  atualizacoesPorDia: 3,
  intervaloEntreAtualizacoesMin: 30,
  maxUsdMes: 25,
  pausado: false,
  geracaoDisponivel: true,
};

function montar(
  inicio = SEIS_DA_MANHA,
  executorOpcoes: Parameters<typeof executorFalso>[2] = {},
  limitesExtras: Partial<LimitesDoServico> = {},
) {
  const repo = new RepositorioEmMemoria();
  const relogio = relogioAjustavel(inicio);
  const executor = executorFalso(repo, relogio, executorOpcoes);
  const orquestrador = new Orquestrador({
    repo,
    executar: executor.executar,
    relogio,
    log: logSilencioso,
    limites: { ...limites, ...limitesExtras },
  });
  const agendador = new Agendador({ orquestrador, repo, relogio, log: logSilencioso });
  return { repo, relogio, executor, orquestrador, agendador };
}

describe("agendador por reconciliação", () => {
  it("antes das 06:00 não faz nada", async () => {
    const { agendador, executor } = montar("2026-11-05T08:59:00.000Z"); // 05:59
    expect(await agendador.reconciliar()).toBe("antes_da_hora");
    expect(executor.chamadas).toHaveLength(0);
  });

  it("às 06:00 começa o briefing diário, sem reserva de verba", async () => {
    const { agendador, executor, orquestrador } = montar();
    expect(await agendador.reconciliar()).toBe("iniciada");
    await orquestrador.aguardar();
    expect(executor.chamadas).toEqual([expect.objectContaining({ tipo: "diaria", reservaUsd: 0 })]);
  });

  it("depois que deu certo, não repete no resto do dia, por mais que o laço rode", async () => {
    const { agendador, executor, orquestrador, relogio } = montar();
    await agendador.reconciliar();
    await orquestrador.aguardar();
    for (let i = 0; i < 200; i++) {
      relogio.avancarMinutos(5);
      expect(await agendador.reconciliar()).toBe("em_dia");
    }
    expect(executor.chamadas).toHaveLength(1);
  });

  it("o laço do minuto seguinte não duplica uma execução em andamento", async () => {
    const { agendador, executor, orquestrador, relogio } = montar();
    executor.segurar();
    expect(await agendador.reconciliar()).toBe("iniciada");
    for (let i = 0; i < 20; i++) {
      relogio.avancar(60_000);
      expect(await agendador.reconciliar()).toBe("em_andamento");
    }
    expect(executor.chamadas).toHaveLength(1);
    executor.liberar();
    await orquestrador.aguardar();
  });

  it("serviço fora do ar às 06:00 e de volta às 14:00: recupera o briefing do dia", async () => {
    const { agendador, executor, orquestrador } = montar("2026-11-05T17:00:00.000Z"); // 14:00
    expect(await agendador.reconciliar()).toBe("iniciada");
    await orquestrador.aguardar();
    expect(executor.chamadas).toHaveLength(1);
  });

  it("se a primeira tentativa falha, espera 10 minutos e tenta uma vez mais; depois desiste", async () => {
    const { agendador, executor, orquestrador, relogio } = montar(SEIS_DA_MANHA, {
      status: "falhou",
    });
    expect(await agendador.reconciliar()).toBe("iniciada");
    await orquestrador.aguardar();

    relogio.avancar(ESPERA_ENTRE_TENTATIVAS_MS - 1);
    expect(await agendador.reconciliar()).toBe("espera_entre_tentativas");
    relogio.avancar(1);
    expect(await agendador.reconciliar()).toBe("iniciada");
    await orquestrador.aguardar();

    for (let i = 0; i < 100; i++) {
      relogio.avancarMinutos(10);
      expect(await agendador.reconciliar()).toBe("desistiu");
    }
    expect(executor.chamadas).toHaveLength(MAX_TENTATIVAS_DA_DIARIA);
  });

  it("parada por trava de custo não é repetida", async () => {
    const { agendador, executor, orquestrador, relogio } = montar(SEIS_DA_MANHA, {
      status: "abortado_por_custo",
    });
    await agendador.reconciliar();
    await orquestrador.aguardar();
    relogio.avancarMinutos(30);
    expect(await agendador.reconciliar()).toBe("desistiu");
    expect(executor.chamadas).toHaveLength(1);
  });

  it("no dia seguinte começa de novo", async () => {
    const { agendador, executor, orquestrador, relogio } = montar();
    await agendador.reconciliar();
    await orquestrador.aguardar();
    relogio.definir("2026-11-06T09:00:00.000Z");
    expect(await agendador.reconciliar()).toBe("iniciada");
    await orquestrador.aguardar();
    expect(executor.chamadas).toHaveLength(2);
  });

  it("sem a chave da Anthropic não gera nada", async () => {
    const { agendador, executor } = montar(SEIS_DA_MANHA, {}, { geracaoDisponivel: false });
    expect(await agendador.reconciliar()).toBe("sem_geracao");
    expect(executor.chamadas).toHaveLength(0);
  });

  it("erro inesperado não derruba o laço: vira 'erro' e a próxima passada tenta de novo", async () => {
    const repo = new RepositorioEmMemoria();
    const relogio = relogioAjustavel(SEIS_DA_MANHA);
    const executor = executorFalso(repo, relogio);
    let quebrar = true;
    const orquestrador = new Orquestrador({
      repo,
      relogio,
      log: logSilencioso,
      limites,
      executar: async (tipo, opcoes) => {
        if (quebrar) throw new Error("rede caiu");
        return executor.executar(tipo, opcoes);
      },
    });
    const agendador = new Agendador({ orquestrador, repo, relogio, log: logSilencioso });
    expect(await agendador.reconciliar()).toBe("erro");
    quebrar = false;
    expect(await agendador.reconciliar()).toBe("iniciada");
    await orquestrador.aguardar();
  });

  it("ao ligar, marca como falha a execução órfã de um processo que morreu", async () => {
    const { agendador, repo, orquestrador } = montar("2026-11-05T09:40:00.000Z");
    await repo.criarExecucao({
      id: "55555555-5555-4555-8555-555555555555",
      data: "2026-11-05",
      tipo: "diaria",
      criadaEm: "2026-11-05T09:00:00.000Z", // rodando há 40 min: o processo morreu
    });
    await agendador.iniciar(3_600_000);
    agendador.parar();
    await orquestrador.aguardar();
    expect((await repo.buscarExecucao("55555555-5555-4555-8555-555555555555"))?.status).toBe(
      "falhou",
    );
  });

  it("ao ligar, não toca numa execução que ainda está dentro do prazo", async () => {
    const { agendador, repo } = montar("2026-11-05T09:10:00.000Z");
    await repo.criarExecucao({
      id: "66666666-6666-4666-8666-666666666666",
      data: "2026-11-05",
      tipo: "diaria",
      criadaEm: "2026-11-05T09:00:00.000Z", // rodando há 10 min: ainda é legítima
    });
    await agendador.iniciar(3_600_000);
    agendador.parar();
    expect((await repo.buscarExecucao("66666666-6666-4666-8666-666666666666"))?.status).toBe(
      "rodando",
    );
  });
});
