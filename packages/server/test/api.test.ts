import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { criarApp, LIMITE_DO_CORPO_BYTES } from "../src/http/app.js";
import { logSilencioso } from "../src/infra/log.js";
import { RepositorioEmMemoria } from "../src/repo/memoria.js";
import { Acesso } from "../src/servico/acesso.js";
import { type LimitesDoServico, Orquestrador } from "../src/servico/orquestrador.js";
import { executorFalso, relogioAjustavel } from "./ajudantes.js";
import { briefingExemplo } from "./briefing-exemplo.js";

// 12:00 em São Paulo, quinta-feira, 5 de novembro de 2026.
const MEIO_DIA = "2026-11-05T15:00:00.000Z";

const limitesPadrao: LimitesDoServico = {
  atualizacoesPorDia: 3,
  intervaloEntreAtualizacoesMin: 30,
  maxUsdMes: 25,
  pausado: false,
  geracaoDisponivel: true,
};

const abertos: FastifyInstance[] = [];
afterEach(async () => {
  for (const app of abertos.splice(0)) await app.close();
});

interface Opcoes {
  limiteDeTaxa?: boolean;
  limites?: Partial<LimitesDoServico>;
  confiarProxySaltos?: number;
  webDist?: string;
  origensPermitidas?: string[];
  repo?: RepositorioEmMemoria;
  executor?: Parameters<typeof executorFalso>[2];
  log?: { stream: NodeJS.WritableStream };
}

async function montar(opcoes: Opcoes = {}) {
  const repo = opcoes.repo ?? new RepositorioEmMemoria();
  const relogio = relogioAjustavel(MEIO_DIA);
  const executor = executorFalso(repo, relogio, opcoes.executor);
  const orquestrador = new Orquestrador({
    repo,
    executar: executor.executar,
    relogio,
    log: logSilencioso,
    limites: { ...limitesPadrao, ...opcoes.limites },
  });
  const acesso = new Acesso({ repo, relogio, inatividadeDias: 90 });
  const app = await criarApp({
    repo,
    acesso,
    orquestrador,
    relogio,
    config: {
      origensPermitidas: opcoes.origensPermitidas ?? [],
      confiarProxySaltos: opcoes.confiarProxySaltos ?? 0,
      webDist: opcoes.webDist,
      limiteDeTaxa: opcoes.limiteDeTaxa ?? false,
      log: opcoes.log ?? false,
    },
  });
  abertos.push(app);

  async function parear(nome = "Celular") {
    const { codigo } = await acesso.gerarCodigo();
    const r = await acesso.parear(codigo, nome);
    if (!r.ok) throw new Error("pareamento do teste falhou");
    return { token: r.token, id: r.dispositivo.id, auth: { authorization: `Bearer ${r.token}` } };
  }
  const semeiar = async (data = "2026-11-05", titulo = "Prefeitura anuncia obras") => {
    const base = briefingExemplo();
    return repo.gravarBriefing({
      data,
      execucaoId: "00000000-0000-4000-8000-000000000001",
      tipo: "diaria",
      criadoEm: `${data}T09:30:00.000Z`,
      briefing: { ...base, data, historiaDoDia: { ...base.historiaDoDia, titulo } },
      avisos: ["um aviso"],
    });
  };
  return { app, repo, relogio, executor, orquestrador, acesso, parear, semeiar };
}

describe("autenticação: tudo que mostra dados ou gasta dinheiro exige token", () => {
  const protegidas: [string, string][] = [
    ["GET", "/api/briefing/hoje"],
    ["GET", "/api/briefing/2026-11-05"],
    ["GET", "/api/historico"],
    ["GET", "/api/estado"],
    ["POST", "/api/atualizar"],
    ["GET", "/api/execucoes/00000000-0000-4000-8000-000000000001"],
    ["GET", "/api/dispositivo"],
    ["DELETE", "/api/dispositivo"],
  ];

  it("sem token: 401 em todas, e a atualização não roda", async () => {
    const { app, executor } = await montar();
    for (const [method, url] of protegidas) {
      const r = await app.inject({ method: method as "GET", url });
      expect(r.statusCode, `${method} ${url}`).toBe(401);
      expect(r.json()).toEqual({ erro: "nao_autorizado" });
      expect(r.headers["www-authenticate"]).toBe("Bearer");
    }
    expect(executor.chamadas).toHaveLength(0);
  });

  it("token inventado, de formato errado ou com esquema errado: 401", async () => {
    const { app, executor } = await montar();
    const lixos = [
      `Bearer ar1_${"A".repeat(43)}`,
      "Bearer qualquer-coisa",
      "Bearer ",
      "Basic YWRtaW46YWRtaW4=",
      `ar1_${"A".repeat(43)}`,
      `Bearer ${"x".repeat(5000)}`,
      "Bearer ar1_'; drop table dispositivos; --",
    ];
    for (const authorization of lixos) {
      for (const [method, url] of protegidas) {
        const r = await app.inject({ method: method as "GET", url, headers: { authorization } });
        expect(r.statusCode, `${method} ${url} com ${authorization.slice(0, 20)}`).toBe(401);
      }
    }
    expect(executor.chamadas).toHaveLength(0);
  });

  it("token revogado: 401", async () => {
    const { app, parear, acesso } = await montar();
    const { auth, id } = await parear();
    expect((await app.inject({ url: "/api/estado", headers: auth })).statusCode).toBe(200);
    await acesso.revogar(id);
    expect((await app.inject({ url: "/api/estado", headers: auth })).statusCode).toBe(401);
  });

  it("'Sair deste aparelho' revoga só o próprio token", async () => {
    const { app, parear } = await montar();
    const a = await parear("A");
    const b = await parear("B");
    const saida = await app.inject({ method: "DELETE", url: "/api/dispositivo", headers: a.auth });
    expect(saida.statusCode).toBe(204);
    expect((await app.inject({ url: "/api/estado", headers: a.auth })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/estado", headers: b.auth })).statusCode).toBe(200);
  });

  it("a rota pública de saúde não pede token e não mostra nada", async () => {
    const { app } = await montar();
    const r = await app.inject({ url: "/api/saude" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true });
  });

  it("saúde dá 503 se o banco cair, sem contar por quê", async () => {
    const repo = new RepositorioEmMemoria();
    repo.execucaoEmAndamento = async () => {
      throw new Error("senha do banco: hunter2");
    };
    const { app } = await montar({ repo });
    const r = await app.inject({ url: "/api/saude" });
    expect(r.statusCode).toBe(503);
    expect(r.body).not.toContain("hunter2");
  });
});

describe("pareamento pela API", () => {
  const parear = (app: FastifyInstance, corpo: unknown, headers: Record<string, string> = {}) =>
    app.inject({ method: "POST", url: "/api/pareamento", payload: corpo as object, headers });

  it("troca o código por um token que funciona nas rotas protegidas", async () => {
    const { app, acesso } = await montar();
    const { codigo } = await acesso.gerarCodigo();
    const r = await parear(app, { codigo, nome: "Meu celular" });
    expect(r.statusCode).toBe(200);
    const { token, dispositivo } = r.json();
    expect(token).toMatch(/^ar1_/);
    expect(dispositivo.nome).toBe("Meu celular");
    expect(JSON.stringify(dispositivo)).not.toContain(token);

    const estado = await app.inject({
      url: "/api/estado",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(estado.statusCode).toBe(200);
  });

  it("código errado, usado ou expirado: a mesma resposta 401 para todos", async () => {
    const { app, acesso, relogio } = await montar();
    const usado = (await acesso.gerarCodigo()).codigo;
    await parear(app, { codigo: usado });
    const expirado = (await acesso.gerarCodigo()).codigo;
    relogio.avancarMinutos(11);

    const respostas = await Promise.all([
      parear(app, { codigo: "ZZZZ-ZZZZ" }),
      parear(app, { codigo: usado }),
      parear(app, { codigo: expirado }),
    ]);
    for (const r of respostas) expect(r.statusCode).toBe(401);
    expect(new Set(respostas.map((r) => r.body)).size).toBe(1);
  });

  it("corpo malformado: 400 genérico, sem devolver o que foi enviado", async () => {
    const { app } = await montar();
    const maus: unknown[] = [
      {},
      { codigo: "" },
      { codigo: 123 },
      { codigo: "x".repeat(65) },
      { codigo: "ABCD-EFGH", extra: "campo a mais" },
      { codigo: "ABCD-EFGH", nome: "n".repeat(101) },
      [],
      "texto",
    ];
    for (const corpo of maus) {
      const r = await app.inject({
        method: "POST",
        url: "/api/pareamento",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify(corpo),
      });
      expect(r.statusCode, JSON.stringify(corpo)).toBe(400);
      expect(r.json()).toEqual({ erro: "requisicao_invalida" });
    }
  });

  it("JSON quebrado, vazio ou com __proto__: 400", async () => {
    const { app } = await montar();
    for (const payload of ["{", "", '{"__proto__": {"admin": true}, "codigo": "ABCD-EFGH"}']) {
      const r = await app.inject({
        method: "POST",
        url: "/api/pareamento",
        headers: { "content-type": "application/json" },
        payload,
      });
      expect(r.statusCode, payload).toBe(400);
    }
  });

  it("corpo maior que o limite: 413, e tipo de conteúdo estranho: 415", async () => {
    const { app } = await montar();
    const grande = await app.inject({
      method: "POST",
      url: "/api/pareamento",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ codigo: "A", nome: "x".repeat(LIMITE_DO_CORPO_BYTES) }),
    });
    expect(grande.statusCode).toBe(413);
    expect(grande.json()).toEqual({ erro: "corpo_grande_demais" });

    // text/plain o Fastify lê como texto; o contrato recusa. Tipos sem leitor dão 415.
    const texto = await app.inject({
      method: "POST",
      url: "/api/pareamento",
      headers: { "content-type": "text/plain" },
      payload: "ABCD-EFGH",
    });
    expect(texto.statusCode).toBe(400);
    const xml = await app.inject({
      method: "POST",
      url: "/api/pareamento",
      headers: { "content-type": "application/xml" },
      payload: "<codigo>ABCD-EFGH</codigo>",
    });
    expect(xml.statusCode).toBe(415);
  });

  it("5 erros queimam o código mesmo que o próximo fosse o certo (pelo HTTP)", async () => {
    const { app, acesso } = await montar();
    const { codigo } = await acesso.gerarCodigo();
    for (let i = 0; i < 5; i++)
      expect((await parear(app, { codigo: "ZZZZ-ZZZZ" })).statusCode).toBe(401);
    expect((await parear(app, { codigo })).statusCode).toBe(401);
  });
});

describe("briefing, histórico e estado", () => {
  it("devolve o briefing de hoje, marcado como do dia", async () => {
    const { app, parear, semeiar } = await montar();
    await semeiar("2026-11-05");
    const { auth } = await parear();
    const r = await app.inject({ url: "/api/briefing/hoje", headers: auth });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      data: "2026-11-05",
      versao: 1,
      doDia: true,
      avisos: ["um aviso"],
    });
    expect(r.json().briefing.historiaDoDia.titulo).toBe("Prefeitura anuncia obras");
    expect(r.headers["cache-control"]).toBe("private, no-cache");
  });

  it("se o de hoje não saiu, mostra o de ontem com doDia falso", async () => {
    const { app, parear, semeiar } = await montar();
    await semeiar("2026-11-04");
    const { auth } = await parear();
    const r = await app.inject({ url: "/api/briefing/hoje", headers: auth });
    expect(r.json()).toMatchObject({ data: "2026-11-04", doDia: false });
  });

  it("sem nenhum briefing: 404", async () => {
    const { app, parear } = await montar();
    const { auth } = await parear();
    expect((await app.inject({ url: "/api/briefing/hoje", headers: auth })).statusCode).toBe(404);
    expect((await app.inject({ url: "/api/briefing/2026-01-01", headers: auth })).statusCode).toBe(
      404,
    );
  });

  it("ETag: a mesma versão devolve 304 sem corpo; versão nova devolve 200", async () => {
    const { app, parear, semeiar } = await montar();
    await semeiar();
    const { auth } = await parear();
    const primeira = await app.inject({ url: "/api/briefing/hoje", headers: auth });
    const etag = primeira.headers.etag as string;
    expect(etag).toBeTruthy();

    const igual = await app.inject({
      url: "/api/briefing/hoje",
      headers: { ...auth, "if-none-match": etag },
    });
    expect(igual.statusCode).toBe(304);
    expect(igual.body).toBe("");
    const fraco = await app.inject({
      url: "/api/briefing/hoje",
      headers: { ...auth, "if-none-match": `W/${etag}` },
    });
    expect(fraco.statusCode).toBe(304);

    await semeiar("2026-11-05", "Versão 2");
    const nova = await app.inject({
      url: "/api/briefing/hoje",
      headers: { ...auth, "if-none-match": etag },
    });
    expect(nova.statusCode).toBe(200);
    expect(nova.json().versao).toBe(2);
  });

  it("a data na URL é validada", async () => {
    const { app, parear } = await montar();
    const { auth } = await parear();
    for (const data of ["ontem", "2026-13-40", "2026-1-1", "'; drop table--", "%00"]) {
      const r = await app.inject({
        url: `/api/briefing/${encodeURIComponent(data)}`,
        headers: auth,
      });
      expect(r.statusCode, data).toBe(400);
    }
  });

  it("histórico: uma linha por data, sem o briefing inteiro", async () => {
    const { app, parear, semeiar } = await montar();
    await semeiar("2026-11-03", "Dia 3");
    await semeiar("2026-11-04", "Dia 4");
    await semeiar("2026-11-05", "Dia 5");
    const { auth } = await parear();
    const r = await app.inject({ url: "/api/historico", headers: auth });
    expect(r.json().dias.map((d: { data: string; titulo: string }) => [d.data, d.titulo])).toEqual([
      ["2026-11-05", "Dia 5"],
      ["2026-11-04", "Dia 4"],
      ["2026-11-03", "Dia 3"],
    ]);
    expect(r.body).not.toContain("oQueAconteceu");
  });

  it("estado: atualizações, gastos e se o briefing atrasou", async () => {
    const { app, parear } = await montar();
    const { auth } = await parear();
    const r = await app.inject({ url: "/api/estado", headers: auth });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      hoje: "2026-11-05",
      briefingDoDia: false,
      briefingAtrasado: true,
      atualizacoes: { usadasHoje: 0, limite: 3 },
      gastos: { mesUsd: 0, tetoUsd: 25, modoLeitura: false },
    });
    expect(r.headers["cache-control"]).toBe("no-store");
  });
});

describe("Atualizar agora pela API", () => {
  it("202 na primeira, e a execução pode ser consultada", async () => {
    const { app, parear, orquestrador, executor } = await montar();
    const { auth } = await parear();
    const r = await app.inject({ method: "POST", url: "/api/atualizar", headers: auth });
    expect(r.statusCode).toBe(202);
    const { execucaoId, situacao } = r.json();
    expect(situacao).toBe("iniciada");
    await orquestrador.aguardar();
    expect(executor.chamadas).toHaveLength(1);

    const e = await app.inject({ url: `/api/execucoes/${execucaoId}`, headers: auth });
    expect(e.statusCode).toBe(200);
    expect(e.json()).toMatchObject({
      id: execucaoId,
      tipo: "atualizacao",
      status: "ok",
      erro: null,
    });
  });

  it("cliques durante a execução: 200 'em andamento' com o mesmo id", async () => {
    const { app, parear, orquestrador, executor } = await montar();
    executor.segurar();
    const { auth } = await parear();
    const primeira = await app.inject({ method: "POST", url: "/api/atualizar", headers: auth });
    const segunda = await app.inject({ method: "POST", url: "/api/atualizar", headers: auth });
    expect(segunda.statusCode).toBe(200);
    expect(segunda.json()).toEqual({
      situacao: "em_andamento",
      execucaoId: primeira.json().execucaoId,
    });
    expect(executor.chamadas).toHaveLength(1);
    executor.liberar();
    await orquestrador.aguardar();
  });

  it("logo depois: 429 com Retry-After e a hora de tentar de novo", async () => {
    const { app, parear, orquestrador } = await montar();
    const { auth } = await parear();
    await app.inject({ method: "POST", url: "/api/atualizar", headers: auth });
    await orquestrador.aguardar();
    const r = await app.inject({ method: "POST", url: "/api/atualizar", headers: auth });
    expect(r.statusCode).toBe(429);
    expect(r.json()).toMatchObject({ erro: "intervalo" });
    expect(r.json().mensagem).toContain("30 minutos");
    expect(Number(r.headers["retry-after"])).toBe(30 * 60);
  });

  it("gastos pausados: 503 e nada roda", async () => {
    const { app, parear, executor } = await montar({ limites: { pausado: true } });
    const { auth } = await parear();
    const r = await app.inject({ method: "POST", url: "/api/atualizar", headers: auth });
    expect(r.statusCode).toBe(503);
    expect(r.json().erro).toBe("pausado");
    expect(executor.chamadas).toHaveLength(0);
    // Leitura continua funcionando em modo leitura.
    expect(
      (await app.inject({ url: "/api/estado", headers: auth })).json().gastos.modoLeitura,
    ).toBe(true);
  });

  it("execução que falhou conta o motivo, sem despejar o erro inteiro", async () => {
    const { app, parear, orquestrador, repo } = await montar({ executor: { status: "falhou" } });
    const { auth } = await parear();
    const r = await app.inject({ method: "POST", url: "/api/atualizar", headers: auth });
    await orquestrador.aguardar();
    await repo.gravarPasso(r.json().execucaoId, {
      passo: "coleta",
      status: "falha",
      tentativa: 1,
      iniciadoEm: MEIO_DIA,
      terminadoEm: MEIO_DIA,
      resumoEntrada: "x",
      saida: null,
      erro: "e".repeat(2000),
      usos: [],
    });
    const e = await app.inject({ url: `/api/execucoes/${r.json().execucaoId}`, headers: auth });
    expect(e.json().status).toBe("falhou");
    expect(e.json().erro).toHaveLength(300);
  });

  it("id de execução inválido: 400; desconhecido: 404", async () => {
    const { app, parear } = await montar();
    const { auth } = await parear();
    expect((await app.inject({ url: "/api/execucoes/abc", headers: auth })).statusCode).toBe(400);
    expect(
      (
        await app.inject({
          url: "/api/execucoes/00000000-0000-4000-8000-0000000000ff",
          headers: auth,
        })
      ).statusCode,
    ).toBe(404);
  });
});

describe("testes de abuso (PLAN.md, seção 2.8, item 10): as travas do banco valem SEM o limite de taxa", () => {
  it("100 pedidos de 'atualizar' ao mesmo tempo: uma execução, o resto 'em andamento'", async () => {
    const { app, parear, executor, orquestrador, repo } = await montar({ limiteDeTaxa: false });
    executor.segurar();
    const { auth } = await parear();
    const respostas = await Promise.all(
      Array.from({ length: 100 }, () =>
        app.inject({ method: "POST", url: "/api/atualizar", headers: auth }),
      ),
    );
    expect(respostas.filter((r) => r.statusCode === 202)).toHaveLength(1);
    expect(respostas.filter((r) => r.statusCode === 200)).toHaveLength(99);
    expect(executor.chamadas).toHaveLength(1);
    executor.liberar();
    await orquestrador.aguardar();
    expect(
      (await repo.execucoesDaData("2026-11-05")).filter((e) => e.tipo === "atualizacao"),
    ).toHaveLength(1);
  });

  it("100 pedidos em sequência, mesmo instante: roda 1, os outros 99 batem no intervalo", async () => {
    const { app, parear, executor, orquestrador } = await montar({ limiteDeTaxa: false });
    const { auth } = await parear();
    const codigos: number[] = [];
    for (let i = 0; i < 100; i++) {
      const r = await app.inject({ method: "POST", url: "/api/atualizar", headers: auth });
      codigos.push(r.statusCode);
      await orquestrador.aguardar();
    }
    expect(codigos.filter((c) => c === 202)).toHaveLength(1);
    expect(codigos.filter((c) => c === 429)).toHaveLength(99);
    expect(executor.chamadas).toHaveLength(1);
  });

  it("de manhã à noite, insistindo a cada 31 minutos: nunca passa de 3 por dia", async () => {
    const { app, parear, executor, orquestrador, relogio } = await montar({ limiteDeTaxa: false });
    const { auth } = await parear();
    relogio.definir("2026-11-05T03:00:00.000Z"); // 00:00 em São Paulo
    for (let i = 0; i < 45; i++) {
      // 45 × 31 min ≈ 23 h
      await app.inject({ method: "POST", url: "/api/atualizar", headers: auth });
      await orquestrador.aguardar();
      relogio.avancarMinutos(31);
    }
    expect(executor.chamadas.filter((c) => c.tipo === "atualizacao")).toHaveLength(3);
  });

  it("5 aparelhos pareados não dão 15 atualizações: o limite é global", async () => {
    const { app, parear, executor, orquestrador, relogio } = await montar({ limiteDeTaxa: false });
    const aparelhos = await Promise.all(["A", "B", "C", "D", "E"].map((n) => parear(n)));
    for (let rodada = 0; rodada < 3; rodada++) {
      for (const { auth } of aparelhos) {
        await app.inject({ method: "POST", url: "/api/atualizar", headers: auth });
        await orquestrador.aguardar();
      }
      relogio.avancarMinutos(31);
    }
    expect(executor.chamadas).toHaveLength(3);
  });

  it("1.000 leituras: nenhuma chamada ao modelo, nenhuma execução criada, custo zero", async () => {
    const { app, parear, semeiar, executor, repo } = await montar({ limiteDeTaxa: false });
    await semeiar();
    const { auth } = await parear();
    const urls = [
      "/api/briefing/hoje",
      "/api/briefing/2026-11-05",
      "/api/historico",
      "/api/estado",
      "/api/dispositivo",
    ];
    const respostas = await Promise.all(
      Array.from({ length: 1000 }, (_, i) =>
        app.inject({ url: urls[i % urls.length] as string, headers: auth }),
      ),
    );
    expect(respostas.every((r) => r.statusCode === 200)).toBe(true);
    expect(executor.chamadas).toHaveLength(0);
    expect(await repo.execucoesDaData("2026-11-05")).toHaveLength(0);
    expect(await repo.gastoDoMesUsd("2026-11")).toBe(0);
  });

  it("1.000 pedidos sem token ou com token falso: tudo 401, nada executa", async () => {
    const { app, executor } = await montar({ limiteDeTaxa: false });
    const respostas = await Promise.all(
      Array.from({ length: 1000 }, (_, i) =>
        app.inject({
          method: "POST",
          url: "/api/atualizar",
          headers: i % 2 === 0 ? {} : { authorization: `Bearer ar1_${"A".repeat(43)}` },
        }),
      ),
    );
    expect(respostas.every((r) => r.statusCode === 401)).toBe(true);
    expect(executor.chamadas).toHaveLength(0);
  });

  it("teto do mês atingido: o app vira leitura e nenhum pedido gasta mais", async () => {
    const { app, parear, repo, executor } = await montar({ limiteDeTaxa: false });
    await repo.gravarUso(
      "00000000-0000-4000-8000-000000000000",
      "redacao",
      {
        modelo: "m",
        tokensEntrada: 1,
        tokensSaida: 1,
        tokensCacheLeitura: 0,
        buscas: 0,
        usd: 25,
      },
      MEIO_DIA,
    );
    const { auth } = await parear();
    for (let i = 0; i < 20; i++) {
      const r = await app.inject({ method: "POST", url: "/api/atualizar", headers: auth });
      expect(r.statusCode).toBe(503);
      expect(r.json().erro).toBe("teto_mensal");
    }
    expect(executor.chamadas).toHaveLength(0);
  });
});

describe("limite de taxa HTTP (primeira cerca, além das travas do banco)", () => {
  it("leituras: depois de 120 por minuto, 429 com Retry-After", async () => {
    const { app, parear } = await montar({ limiteDeTaxa: true });
    const { auth } = await parear();
    const codigos: number[] = [];
    let ultima = null as Awaited<ReturnType<typeof app.inject>> | null;
    for (let i = 0; i < 130; i++) {
      ultima = await app.inject({ url: "/api/estado", headers: auth });
      codigos.push(ultima.statusCode);
    }
    expect(codigos.filter((c) => c === 200)).toHaveLength(120);
    expect(codigos.filter((c) => c === 429)).toHaveLength(10);
    expect(ultima?.json()).toMatchObject({ erro: "muitas_requisicoes" });
    expect(ultima?.headers["retry-after"]).toBeTruthy();
  });

  it("quem só erra o token também é segurado (o limite roda antes da autenticação)", async () => {
    const { app } = await montar({ limiteDeTaxa: true });
    const codigos: number[] = [];
    for (let i = 0; i < 300; i++) {
      codigos.push((await app.inject({ url: "/api/estado" })).statusCode);
    }
    expect(codigos.filter((c) => c === 401)).toHaveLength(120);
    expect(codigos.filter((c) => c === 429)).toHaveLength(180);
  });

  it("pareamento: 5 tentativas por 10 minutos por IP, depois 429", async () => {
    const { app } = await montar({ limiteDeTaxa: true });
    const codigos: number[] = [];
    for (let i = 0; i < 8; i++) {
      codigos.push(
        (
          await app.inject({
            method: "POST",
            url: "/api/pareamento",
            payload: { codigo: "ZZZZ-ZZZZ" },
          })
        ).statusCode,
      );
    }
    expect(codigos).toEqual([401, 401, 401, 401, 401, 429, 429, 429]);
  });

  it("atualizar: 10 pedidos por hora por IP, mesmo que o banco deixasse mais", async () => {
    const { app, parear } = await montar({ limiteDeTaxa: true, limites: { pausado: true } });
    const { auth } = await parear();
    const codigos: number[] = [];
    for (let i = 0; i < 14; i++) {
      codigos.push(
        (await app.inject({ method: "POST", url: "/api/atualizar", headers: auth })).statusCode,
      );
    }
    expect(codigos.filter((c) => c === 503)).toHaveLength(10);
    expect(codigos.filter((c) => c === 429)).toHaveLength(4);
  });

  it("sem confiar em proxy, X-Forwarded-For forjado não escapa do limite", async () => {
    const { app } = await montar({ limiteDeTaxa: true, confiarProxySaltos: 0 });
    const codigos: number[] = [];
    for (let i = 0; i < 8; i++) {
      codigos.push(
        (
          await app.inject({
            method: "POST",
            url: "/api/pareamento",
            payload: { codigo: "ZZZZ-ZZZZ" },
            headers: { "x-forwarded-for": `203.0.113.${i + 1}` },
          })
        ).statusCode,
      );
    }
    expect(codigos.filter((c) => c === 429)).toHaveLength(3);
  });

  it("confiando em 1 proxy, valer o IP que o proxy viu; o que o cliente escreve antes é ignorado", async () => {
    const { app } = await montar({ limiteDeTaxa: true, confiarProxySaltos: 1 });
    const codigos: number[] = [];
    for (let i = 0; i < 8; i++) {
      codigos.push(
        (
          await app.inject({
            method: "POST",
            url: "/api/pareamento",
            payload: { codigo: "ZZZZ-ZZZZ" },
            remoteAddress: "10.0.0.1",
            // O cliente forja o começo da lista; o proxy acrescenta o IP real (198.51.100.7) no fim.
            headers: { "x-forwarded-for": `203.0.113.${i + 1}, 198.51.100.7` },
          })
        ).statusCode,
      );
    }
    expect(codigos.filter((c) => c === 429)).toHaveLength(3);
  });
});

describe("cabeçalhos, CORS, erros e logs", () => {
  it("cabeçalhos de segurança e nada que denuncie a tecnologia", async () => {
    const { app } = await montar();
    const r = await app.inject({ url: "/api/saude" });
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(r.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(r.headers["x-powered-by"]).toBeUndefined();
    expect(r.headers["strict-transport-security"]).toBeTruthy();
    expect(r.headers["cache-control"]).toBe("no-store");
  });

  it("CORS: aceita as cascas e as origens liberadas; recusa o resto", async () => {
    const { app } = await montar({ origensPermitidas: ["https://arauto.example"] });
    const preflight = (origin: string) =>
      app.inject({
        method: "OPTIONS",
        url: "/api/atualizar",
        headers: {
          origin,
          "access-control-request-method": "POST",
          "access-control-request-headers": "authorization",
        },
      });
    for (const permitida of [
      "capacitor://localhost",
      "https://tauri.localhost",
      "https://arauto.example",
    ]) {
      expect((await preflight(permitida)).headers["access-control-allow-origin"], permitida).toBe(
        permitida,
      );
    }
    for (const recusada of ["https://evil.example", "null", "http://localhost:5173"]) {
      expect(
        (await preflight(recusada)).headers["access-control-allow-origin"],
        recusada,
      ).toBeUndefined();
    }
  });

  it("erro interno: 500 genérico, sem mensagem, sem pilha, sem o que foi enviado", async () => {
    const repo = new RepositorioEmMemoria();
    repo.ultimoBriefing = async () => {
      throw new Error("falha em /var/app/src/repo.ts: senha=hunter2");
    };
    const { app, parear } = await montar({ repo });
    const { auth } = await parear();
    const r = await app.inject({ url: "/api/briefing/hoje", headers: auth });
    expect(r.statusCode).toBe(500);
    expect(r.json()).toEqual({ erro: "erro_interno" });
    expect(r.body).not.toMatch(/hunter2|repo\.ts|at \w+/);
  });

  it("o token e o código de pareamento nunca aparecem no log", async () => {
    const linhas: string[] = [];
    const stream = new Writable({
      write(pedaco, _enc, pronto) {
        linhas.push(String(pedaco));
        pronto();
      },
    });
    const { app, acesso } = await montar({ log: { stream } });
    const { codigo } = await acesso.gerarCodigo();
    const pareado = await app.inject({
      method: "POST",
      url: "/api/pareamento",
      payload: { codigo, nome: "x" },
    });
    const { token } = pareado.json();
    await app.inject({ url: "/api/estado", headers: { authorization: `Bearer ${token}` } });
    await app.inject({ url: "/api/estado", headers: { authorization: "Bearer ar1_falso" } });

    const log = linhas.join("");
    expect(log.length).toBeGreaterThan(0); // o log funciona...
    expect(log).not.toContain(token);
    expect(log).not.toContain(codigo);
    expect(log.toLowerCase()).not.toContain("authorization");
    expect(log).not.toContain("ar1_falso");
  });
});

describe("arquivos pela URL (PLAN.md, seção 2.9)", () => {
  const pastas: string[] = [];
  afterAll(() => {
    for (const pasta of pastas) rmSync(pasta, { recursive: true, force: true });
  });

  /** Uma pasta com um "dist" e, FORA dele, segredos que jamais podem sair. */
  function criarDist() {
    const raiz = mkdtempSync(join(tmpdir(), "arauto-web-"));
    pastas.push(raiz);
    const dist = join(raiz, "dist");
    mkdirSync(join(dist, "assets"), { recursive: true });
    mkdirSync(join(dist, ".git"), { recursive: true });
    mkdirSync(join(dist, "interna"), { recursive: true });
    writeFileSync(join(dist, "index.html"), "<html>ARAUTO-INDEX</html>");
    writeFileSync(join(dist, "sw.js"), "// service worker");
    writeFileSync(join(dist, "assets", "app.abc123.js"), "console.log('app')");
    writeFileSync(join(dist, ".env"), "SEGREDO-DOTENV-DENTRO-DO-DIST");
    writeFileSync(join(dist, ".git", "config"), "SEGREDO-GIT-DENTRO-DO-DIST");
    writeFileSync(join(dist, "interna", ".oculto"), "SEGREDO-OCULTO");
    writeFileSync(join(raiz, "segredo.txt"), "SEGREDO-FORA-DA-PASTA");
    writeFileSync(join(raiz, "package.json"), '{"name":"SEGREDO-PACKAGE-JSON"}');
    return dist;
  }

  it("serve a página, os assets e o service worker com o cache certo", async () => {
    const { app } = await montar({ webDist: criarDist() });
    const raiz = await app.inject({ url: "/" });
    expect(raiz.statusCode).toBe(200);
    expect(raiz.body).toContain("ARAUTO-INDEX");
    expect(raiz.headers["cache-control"]).toBe("no-cache");
    expect((await app.inject({ url: "/sw.js" })).headers["cache-control"]).toBe("no-cache");
    const asset = await app.inject({ url: "/assets/app.abc123.js" });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
  });

  /**
   * Requisição HTTP de verdade, com o caminho EXATAMENTE como escrito. O `app.inject` passa a URL
   * pelo parser do WHATWG, que transforma "%2e%2e" em ".." e resolve antes de o servidor ver; um
   * atacante real não passa por esse filtro.
   */
  async function pedirCru(app: FastifyInstance, caminho: string) {
    if (!app.server.listening) await app.listen({ port: 0, host: "127.0.0.1" });
    const { port } = app.server.address() as AddressInfo;
    return new Promise<{ status: number; corpo: string }>((resolver, rejeitar) => {
      const req = request(
        { host: "127.0.0.1", port, path: caminho, headers: { accept: "text/html" } },
        (res) => {
          let corpo = "";
          res.on("data", (pedaco) => {
            corpo += pedaco;
          });
          res.on("end", () => resolver({ status: res.statusCode ?? 0, corpo }));
        },
      );
      req.on("error", rejeitar);
      req.end();
    });
  }

  /** Arquivos que existem (dentro ou fora da pasta) e nunca podem sair: 404, como se não existissem. */
  const ocultosEDoRepositorio = [
    "/.env",
    "/.git/config",
    "/.git/",
    "/interna/.oculto",
    "/package.json",
    "/pnpm-lock.yaml",
    "/packages/server/src/index.ts",
    "/packages/server/package.json",
    "/segredo.txt",
    "/.ENV",
    "/%2eenv",
    "/%2egit/config",
  ];

  /** Tentativas de sair da pasta com "..": basta não servir nada; 400, 403 ou 404 são todos aceitáveis. */
  const travessias = [
    "/../segredo.txt",
    "/../package.json",
    "/%2e%2e/segredo.txt",
    "/%2e%2e%2fsegredo.txt",
    "/..%2fsegredo.txt",
    "/assets/../../segredo.txt",
    "/assets/%2e%2e/%2e%2e/segredo.txt",
    "/assets//..//..//segredo.txt",
    "/%2e%2e/%2e%2e/etc/passwd",
    "/..%5csegredo.txt",
    "/index.html/../../segredo.txt",
    "/%252e%252e/segredo.txt",
    "/..;/segredo.txt",
    "/assets/..%00/segredo.txt",
    "/.env%00.js", // byte nulo: pedido malformado, o framework recusa
  ];

  it("arquivo oculto ou do repositório: 404, e nunca o conteúdo", async () => {
    const { app } = await montar({ webDist: criarDist() });
    for (const caminho of ocultosEDoRepositorio) {
      const r = await pedirCru(app, caminho);
      expect(r.corpo, caminho).not.toMatch(/SEGREDO|root:/);
      expect(r.status, caminho).toBe(404);
    }
  });

  it("tentativa de sair da pasta com '..' (na forma crua, codificada ou dupla): nunca serve nada", async () => {
    const { app } = await montar({ webDist: criarDist() });
    for (const caminho of travessias) {
      const r = await pedirCru(app, caminho);
      expect(r.corpo, caminho).not.toMatch(/SEGREDO|root:/);
      expect([400, 403, 404], `${caminho} → ${r.status}`).toContain(r.status);
    }
  });

  it("listar uma pasta não mostra os arquivos dela", async () => {
    const { app } = await montar({ webDist: criarDist() });
    for (const url of ["/assets/", "/assets", "/interna/"]) {
      const r = await app.inject({ url });
      expect(r.body, url).not.toContain("app.abc123.js");
      expect(r.body, url).not.toContain("oculto");
    }
  });

  it("rota da interface cai na página; arquivo inexistente e API desconhecida dão 404 de verdade", async () => {
    const { app } = await montar({ webDist: criarDist() });
    const lab = await app.inject({ url: "/lab" });
    expect(lab.statusCode).toBe(200);
    expect(lab.body).toContain("ARAUTO-INDEX");
    expect((await app.inject({ url: "/instalar?x=1" })).body).toContain("ARAUTO-INDEX");

    for (const url of ["/sumiu.js", "/api/inexistente", "/api/", "/api"]) {
      const r = await app.inject({ url });
      expect(r.statusCode, url).toBe(404);
      expect(r.json(), url).toEqual({ erro: "nao_encontrado" });
    }
    expect((await app.inject({ method: "POST", url: "/lab" })).statusCode).toBe(404);
  });

  it("sem pasta da web, o servidor serve só a API", async () => {
    const { app } = await montar({ webDist: join(tmpdir(), "nao-existe-arauto") });
    expect((await app.inject({ url: "/" })).statusCode).toBe(404);
    expect((await app.inject({ url: "/api/saude" })).statusCode).toBe(200);
  });
});
