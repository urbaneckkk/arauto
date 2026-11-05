import { describe, expect, it } from "vitest";
import { logSilencioso } from "../src/infra/log.js";
import { RepositorioEmMemoria } from "../src/repo/memoria.js";
import { ExecucaoEmAndamento } from "../src/repo/repositorio.js";
import {
  diasRestantesDepoisDe,
  inicioDoProximoDia,
  minutosDoDiaEmSaoPaulo,
} from "../src/servico/calendario.js";
import {
  CUSTO_DIARIO_PADRAO_USD,
  calcularReservaUsd,
  nivelDeGasto,
} from "../src/servico/orcamento-mensal.js";
import { type LimitesDoServico, Orquestrador } from "../src/servico/orquestrador.js";
import { executorFalso, relogioAjustavel } from "./ajudantes.js";

// 12:00 em São Paulo (UTC-3), quinta-feira, 5 de novembro de 2026. O mês tem 30 dias.
const MEIO_DIA = "2026-11-05T15:00:00.000Z";

const limitesPadrao: LimitesDoServico = {
  atualizacoesPorDia: 3,
  intervaloEntreAtualizacoesMin: 30,
  maxUsdMes: 25,
  pausado: false,
  geracaoDisponivel: true,
};

function montar(
  limites: Partial<LimitesDoServico> = {},
  executorOpcoes: Parameters<typeof executorFalso>[2] = {},
  inicio = MEIO_DIA,
) {
  const repo = new RepositorioEmMemoria();
  const relogio = relogioAjustavel(inicio);
  const executor = executorFalso(repo, relogio, executorOpcoes);
  const orquestrador = new Orquestrador({
    repo,
    executar: executor.executar,
    relogio,
    log: logSilencioso,
    limites: { ...limitesPadrao, ...limites },
  });
  return { repo, relogio, executor, orquestrador };
}

const gastar = (repo: RepositorioEmMemoria, usd: number, quando = MEIO_DIA) =>
  repo.gravarUso(
    "00000000-0000-4000-8000-000000000000",
    "redacao",
    {
      modelo: "claude-sonnet-5-5",
      tokensEntrada: 1,
      tokensSaida: 1,
      tokensCacheLeitura: 0,
      buscas: 0,
      usd,
    },
    quando,
  );

describe("calendário e reserva mensal", () => {
  it("minutos do dia no horário de São Paulo", () => {
    expect(minutosDoDiaEmSaoPaulo(new Date("2026-11-05T09:00:00Z"))).toBe(6 * 60);
    expect(minutosDoDiaEmSaoPaulo(new Date("2026-11-05T08:59:00Z"))).toBe(5 * 60 + 59);
    expect(minutosDoDiaEmSaoPaulo(new Date("2026-11-05T02:59:00Z"))).toBe(23 * 60 + 59); // ainda dia 4 em SP
  });

  it("o próximo dia começa à meia-noite de São Paulo", () => {
    expect(Date.parse(inicioDoProximoDia(new Date(MEIO_DIA)))).toBe(
      Date.parse("2026-11-06T03:00:00Z"),
    );
    // 23:30 de SP do dia 5 (02:30Z do dia 6): o próximo dia ainda é o dia 6.
    expect(Date.parse(inicioDoProximoDia(new Date("2026-11-06T02:30:00Z")))).toBe(
      Date.parse("2026-11-06T03:00:00Z"),
    );
  });

  it("dias que faltam no mês, inclusive em fevereiro bissexto", () => {
    expect(diasRestantesDepoisDe("2026-11-05")).toBe(25);
    expect(diasRestantesDepoisDe("2026-11-30")).toBe(0);
    expect(diasRestantesDepoisDe("2028-02-10")).toBe(19); // 29 dias
    expect(diasRestantesDepoisDe("2027-02-10")).toBe(18); // 28 dias
  });

  it("a reserva inclui o dia de hoje enquanto o briefing dele não saiu", () => {
    const base = { hoje: "2026-11-05", custoDiarioUsd: 0.5 };
    expect(calcularReservaUsd({ ...base, briefingDeHojeJaGerado: false })).toBe(13);
    expect(calcularReservaUsd({ ...base, briefingDeHojeJaGerado: true })).toBe(12.5);
    expect(
      calcularReservaUsd({ hoje: "2026-11-30", briefingDeHojeJaGerado: true, custoDiarioUsd: 0.5 }),
    ).toBe(0);
  });

  it("níveis de aviso de gasto: 50%, 80% e 100%", () => {
    expect(nivelDeGasto(12.4, 25)).toBe(0);
    expect(nivelDeGasto(12.5, 25)).toBe(50);
    expect(nivelDeGasto(20, 25)).toBe(80);
    expect(nivelDeGasto(25, 25)).toBe(100);
    expect(nivelDeGasto(30, 25)).toBe(100);
  });
});

describe("Atualizar agora", () => {
  it("começa uma atualização e devolve o id já existente no banco", async () => {
    const { orquestrador, executor, repo } = montar();
    const pedido = await orquestrador.pedirAtualizacao();
    expect(pedido.situacao).toBe("iniciada");
    if (pedido.situacao !== "iniciada") return;
    expect(executor.chamadas).toHaveLength(1);
    expect(executor.chamadas[0]).toMatchObject({ tipo: "atualizacao", id: pedido.execucaoId });
    expect((await repo.buscarExecucao(pedido.execucaoId))?.tipo).toBe("atualizacao");
    await orquestrador.aguardar();
  });

  it("vários cliques durante uma execução viram um só, e não gastam do limite", async () => {
    const { orquestrador, executor } = montar();
    executor.segurar();
    const primeiro = await orquestrador.pedirAtualizacao();
    const outros = await Promise.all(
      Array.from({ length: 20 }, () => orquestrador.pedirAtualizacao()),
    );
    expect(executor.chamadas).toHaveLength(1);
    expect(primeiro.situacao).toBe("iniciada");
    for (const outro of outros) {
      expect(outro).toMatchObject({
        situacao: "em_andamento",
        execucaoId: (primeiro as { execucaoId: string }).execucaoId,
      });
    }
    executor.liberar();
    await orquestrador.aguardar();
  });

  it("100 pedidos ao mesmo tempo: uma única execução paga", async () => {
    const { orquestrador, executor } = montar();
    executor.segurar();
    const respostas = await Promise.all(
      Array.from({ length: 100 }, () => orquestrador.pedirAtualizacao()),
    );
    expect(executor.chamadas).toHaveLength(1);
    expect(respostas.filter((r) => r.situacao === "iniciada")).toHaveLength(1);
    expect(respostas.filter((r) => r.situacao === "em_andamento")).toHaveLength(99);
    executor.liberar();
    await orquestrador.aguardar();
  });

  it("depois que termina, só libera outra depois de 30 minutos", async () => {
    const { orquestrador, executor, relogio } = montar();
    await orquestrador.pedirAtualizacao();
    await orquestrador.aguardar();

    relogio.avancarMinutos(29);
    const cedo = await orquestrador.pedirAtualizacao();
    expect(cedo).toMatchObject({ situacao: "recusada", motivo: "intervalo" });
    if (cedo.situacao === "recusada") {
      expect(Date.parse(cedo.tentarEm ?? "")).toBe(Date.parse(MEIO_DIA) + 30 * 60_000);
    }
    expect(executor.chamadas).toHaveLength(1);

    relogio.avancarMinutos(1);
    expect((await orquestrador.pedirAtualizacao()).situacao).toBe("iniciada");
    await orquestrador.aguardar();
  });

  it("no máximo 3 por dia, somando tudo; volta no dia seguinte", async () => {
    const { orquestrador, executor, relogio } = montar();
    for (let i = 0; i < 3; i++) {
      expect((await orquestrador.pedirAtualizacao()).situacao).toBe("iniciada");
      await orquestrador.aguardar();
      relogio.avancarMinutos(31);
    }
    const quarta = await orquestrador.pedirAtualizacao();
    expect(quarta).toMatchObject({ situacao: "recusada", motivo: "limite_diario" });
    if (quarta.situacao === "recusada") {
      expect(Date.parse(quarta.tentarEm ?? "")).toBe(Date.parse("2026-11-06T03:00:00Z"));
      expect(quarta.mensagem).toContain("3 atualizações");
    }
    expect(executor.chamadas).toHaveLength(3);

    relogio.definir("2026-11-06T12:00:00.000Z");
    expect((await orquestrador.pedirAtualizacao()).situacao).toBe("iniciada");
    await orquestrador.aguardar();
  });

  it("atualização que falhou ou foi barrada por custo também gasta do limite", async () => {
    const { orquestrador, executor, relogio } = montar({}, { status: "falhou" });
    for (let i = 0; i < 3; i++) {
      await orquestrador.pedirAtualizacao();
      await orquestrador.aguardar();
      relogio.avancarMinutos(31);
    }
    expect((await orquestrador.pedirAtualizacao()).situacao).toBe("recusada");
    expect(executor.chamadas).toHaveLength(3);
  });

  it("gastos pausados: recusa sem rodar nada", async () => {
    const { orquestrador, executor } = montar({ pausado: true });
    expect(await orquestrador.pedirAtualizacao()).toMatchObject({
      situacao: "recusada",
      motivo: "pausado",
    });
    expect(executor.chamadas).toHaveLength(0);
  });

  it("sem a chave da Anthropic: recusa sem rodar nada", async () => {
    const { orquestrador, executor } = montar({ geracaoDisponivel: false });
    expect(await orquestrador.pedirAtualizacao()).toMatchObject({
      situacao: "recusada",
      motivo: "sem_chave",
    });
    expect((await orquestrador.iniciarDiaria()).situacao).toBe("recusada");
    expect(executor.chamadas).toHaveLength(0);
  });

  it("teto do mês atingido: recusa", async () => {
    const { orquestrador, executor, repo } = montar();
    await gastar(repo, 25);
    expect(await orquestrador.pedirAtualizacao()).toMatchObject({
      situacao: "recusada",
      motivo: "teto_mensal",
    });
    expect(executor.chamadas).toHaveLength(0);
  });

  it("não invade a reserva dos briefings diários que faltam", async () => {
    // Dia 5, sem briefing de hoje: reserva = (25 dias + hoje) × US$ 0,50 = US$ 13. Folga = 25 − 13 = 12.
    const { orquestrador, executor, repo } = montar();
    await gastar(repo, 11.6); // 11,6 + 0,5 = 12,1 > 12 → barrado
    const barrada = await orquestrador.pedirAtualizacao();
    expect(barrada).toMatchObject({ situacao: "recusada", motivo: "reserva" });
    if (barrada.situacao === "recusada") expect(barrada.mensagem).toContain("US$ 13.00");
    expect(executor.chamadas).toHaveLength(0);
  });

  it("logo abaixo da reserva ainda deixa atualizar, e passa a reserva ao pipeline", async () => {
    const { orquestrador, executor, repo } = montar();
    await gastar(repo, 11.4); // 11,4 + 0,5 = 11,9 <= 12
    expect((await orquestrador.pedirAtualizacao()).situacao).toBe("iniciada");
    await orquestrador.aguardar();
    expect(executor.chamadas[0]?.reservaUsd).toBe(13);
  });

  it("usa a média REAL dos briefings diários, não o palpite, para reservar", async () => {
    const { orquestrador, executor, repo } = montar();
    // Três diárias reais de US$ 0,20. Hoje ainda não saiu: reserva = 26 dias × 0,20 = 5,20.
    for (const dia of ["01", "02", "03"]) {
      const id = `00000000-0000-4000-8000-0000000000${dia}`;
      await repo.criarExecucao({
        id,
        data: `2026-11-${dia}`,
        tipo: "diaria",
        criadaEm: `2026-11-${dia}T09:00:00.000Z`,
      });
      await repo.gravarUso(
        id,
        "redacao",
        {
          modelo: "m",
          tokensEntrada: 1,
          tokensSaida: 1,
          tokensCacheLeitura: 0,
          buscas: 0,
          usd: 0.2,
        },
        `2026-11-${dia}T09:10:00.000Z`,
      );
      await repo.atualizarStatus(id, "ok");
    }
    await orquestrador.pedirAtualizacao();
    await orquestrador.aguardar();
    expect(executor.chamadas[0]?.reservaUsd).toBeCloseTo(5.2, 6);
    expect(CUSTO_DIARIO_PADRAO_USD).toBe(0.5); // o palpite só vale sem histórico
  });

  it("execução de outra instância (deploy sobreposto) é reconhecida e não duplicada", async () => {
    const { orquestrador, executor, repo } = montar();
    await repo.criarExecucao({
      id: "11111111-1111-4111-8111-111111111111",
      data: "2026-11-05",
      tipo: "diaria",
      criadaEm: MEIO_DIA,
    });
    expect(await orquestrador.pedirAtualizacao()).toEqual({
      situacao: "em_andamento",
      execucaoId: "11111111-1111-4111-8111-111111111111",
    });
    expect(executor.chamadas).toHaveLength(0);
  });

  it("perde a corrida contra outra instância: o banco recusa e o pedido vira 'em andamento'", async () => {
    const repo = new RepositorioEmMemoria();
    const relogio = relogioAjustavel(MEIO_DIA);
    const bom = executorFalso(repo, relogio);
    const orquestrador = new Orquestrador({
      repo,
      relogio,
      log: logSilencioso,
      limites: limitesPadrao,
      // Entre a checagem e a criação, outra instância (deploy sobreposto) começa a rodar.
      executar: async (tipo, opcoes) => {
        await repo.criarExecucao({
          id: "22222222-2222-4222-8222-222222222222",
          data: "2026-11-05",
          tipo: "diaria",
          criadaEm: MEIO_DIA,
        });
        return bom.executar(tipo, opcoes);
      },
    });
    expect(await orquestrador.pedirAtualizacao()).toEqual({
      situacao: "em_andamento",
      execucaoId: "22222222-2222-4222-8222-222222222222",
    });
    expect(bom.chamadas).toHaveLength(1); // tentou, e o banco barrou
    expect(
      (await repo.execucoesDaData("2026-11-05")).filter((e) => e.tipo === "atualizacao"),
    ).toHaveLength(0);
  });

  it("falha antes de a execução existir: o erro sobe e o serviço não trava", async () => {
    const repo = new RepositorioEmMemoria();
    const relogio = relogioAjustavel(MEIO_DIA);
    let falhar = true;
    const bom = executorFalso(repo, relogio);
    const orquestrador = new Orquestrador({
      repo,
      relogio,
      log: logSilencioso,
      limites: limitesPadrao,
      executar: async (tipo, opcoes) => {
        if (falhar) throw new Error("banco fora do ar");
        return bom.executar(tipo, opcoes);
      },
    });
    await expect(orquestrador.pedirAtualizacao()).rejects.toThrow("banco fora do ar");
    falhar = false;
    expect((await orquestrador.pedirAtualizacao()).situacao).toBe("iniciada");
    await orquestrador.aguardar();
  });

  it("falha DEPOIS de criar: a execução vira 'falhou' e não prende a trava", async () => {
    const { orquestrador, repo, executor, relogio } = montar({}, { quebrarDepoisDeCriar: true });
    const pedido = await orquestrador.pedirAtualizacao();
    await orquestrador.aguardar();
    if (pedido.situacao !== "iniciada") throw new Error("deveria ter iniciado");
    expect((await repo.buscarExecucao(pedido.execucaoId))?.status).toBe("falhou");

    executor.definir({ quebrarDepoisDeCriar: false });
    relogio.avancarMinutos(31);
    expect((await orquestrador.pedirAtualizacao()).situacao).toBe("iniciada");
    await orquestrador.aguardar();
  });

  it("o briefing diário ignora os limites de atualização", async () => {
    const { orquestrador, executor, relogio } = montar();
    for (let i = 0; i < 3; i++) {
      await orquestrador.pedirAtualizacao();
      await orquestrador.aguardar();
      relogio.avancarMinutos(31);
    }
    expect((await orquestrador.iniciarDiaria()).situacao).toBe("iniciada");
    await orquestrador.aguardar();
    expect(executor.chamadas.at(-1)).toMatchObject({ tipo: "diaria", reservaUsd: 0 });
  });
});

describe("estado do serviço", () => {
  it("começa vazio: sem execução, sem briefing, tudo liberado", async () => {
    const { orquestrador } = montar();
    const estado = await orquestrador.estado();
    expect(estado).toMatchObject({
      hoje: "2026-11-05",
      emAndamento: null,
      ultimaExecucao: null,
      briefingDoDia: false,
      briefingAtrasado: true, // meio-dia e nada de briefing
      atualizacoes: { usadasHoje: 0, limite: 3, liberadaEm: null },
      gastos: { mesUsd: 0, tetoUsd: 25, nivel: 0, pausado: false, modoLeitura: false },
    });
  });

  it("o atraso só vale a partir das 06:40", async () => {
    const cedo = montar({}, {}, "2026-11-05T09:39:00.000Z"); // 06:39
    expect((await cedo.orquestrador.estado()).briefingAtrasado).toBe(false);
    const tarde = montar({}, {}, "2026-11-05T09:40:00.000Z"); // 06:40
    expect((await tarde.orquestrador.estado()).briefingAtrasado).toBe(true);
  });

  it("durante a execução mostra qual é; depois mostra quando libera a próxima", async () => {
    const { orquestrador, executor, relogio } = montar();
    executor.segurar();
    const pedido = await orquestrador.pedirAtualizacao();
    expect((await orquestrador.estado()).emAndamento).toMatchObject({
      id: (pedido as { execucaoId: string }).execucaoId,
      tipo: "atualizacao",
    });
    executor.liberar();
    await orquestrador.aguardar();

    relogio.avancarMinutos(10);
    const estado = await orquestrador.estado();
    expect(estado.emAndamento).toBeNull();
    expect(estado.atualizacoes.usadasHoje).toBe(1);
    expect(Date.parse(estado.atualizacoes.liberadaEm ?? "")).toBe(
      Date.parse(MEIO_DIA) + 30 * 60_000,
    );
  });

  it("modo leitura e nível de gasto acompanham o dinheiro e o interruptor", async () => {
    const { orquestrador, repo } = montar();
    await gastar(repo, 20);
    expect((await orquestrador.estado()).gastos).toMatchObject({ nivel: 80, modoLeitura: false });
    await gastar(repo, 5);
    expect((await orquestrador.estado()).gastos).toMatchObject({ nivel: 100, modoLeitura: true });

    const pausado = montar({ pausado: true });
    expect((await pausado.orquestrador.estado()).gastos).toMatchObject({
      pausado: true,
      modoLeitura: true,
    });
  });

  it("depois do 3º uso, a liberação é à meia-noite", async () => {
    const { orquestrador, relogio } = montar();
    for (let i = 0; i < 3; i++) {
      await orquestrador.pedirAtualizacao();
      await orquestrador.aguardar();
      relogio.avancarMinutos(31);
    }
    const estado = await orquestrador.estado();
    expect(Date.parse(estado.atualizacoes.liberadaEm ?? "")).toBe(
      Date.parse("2026-11-06T03:00:00Z"),
    );
  });
});

describe("a regra de uma execução por vez é do banco", () => {
  it("o repositório recusa a segunda, e a recusa é do tipo certo", async () => {
    const repo = new RepositorioEmMemoria();
    await repo.criarExecucao({
      id: "33333333-3333-4333-8333-333333333333",
      data: "2026-11-05",
      tipo: "diaria",
      criadaEm: MEIO_DIA,
    });
    await expect(
      repo.criarExecucao({
        id: "44444444-4444-4444-8444-444444444444",
        data: "2026-11-05",
        tipo: "atualizacao",
        criadaEm: MEIO_DIA,
      }),
    ).rejects.toBeInstanceOf(ExecucaoEmAndamento);
  });
});
