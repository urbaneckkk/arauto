import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { RepositorioEmArquivo } from "../src/repo/arquivo.js";
import { RepositorioEmMemoria } from "../src/repo/memoria.js";
import { migrar } from "../src/repo/migrar.js";
import { conectar, RepositorioPostgres } from "../src/repo/postgres.js";
import {
  ExecucaoEmAndamento,
  MAX_TENTATIVAS_DE_CODIGO,
  type RepositorioDoServico,
} from "../src/repo/repositorio.js";
import { briefingExemplo } from "./briefing-exemplo.js";

interface Ambiente {
  repo: RepositorioDoServico;
  limpar(): Promise<void>;
}

const uso = (usd: number, buscas = 0) => ({
  modelo: "claude-sonnet-5-5",
  tokensEntrada: 1000,
  tokensSaida: 500,
  tokensCacheLeitura: 0,
  buscas,
  usd,
});

const passo = (nome: "coleta" | "redacao", extras: object = {}) => ({
  passo: nome,
  status: "ok" as const,
  tentativa: 1,
  iniciadoEm: "2026-11-05T09:00:00.000Z",
  terminadoEm: "2026-11-05T09:01:00.000Z",
  resumoEntrada: "entrada de teste",
  saida: { itens: 412, lista: ["a", "b"], aninhado: { ok: true } },
  erro: null,
  usos: [],
  ...extras,
});

/**
 * Os mesmos testes valem para toda implementação do repositório: o pipeline não pode perceber
 * se está gravando em memória, em arquivo ou no Postgres.
 */
function contrato(nome: string, criar: () => Promise<Ambiente>) {
  describe(`repositório: ${nome}`, () => {
    let ambiente: Ambiente;
    let repo: RepositorioDoServico;
    beforeEach(async () => {
      ambiente = await criar();
      await ambiente.limpar();
      repo = ambiente.repo;
    });

    const novaExecucao = async (id = randomUUID(), data = "2026-11-05") => {
      await repo.criarExecucao({ id, data, tipo: "diaria", criadaEm: `${data}T09:00:00.000Z` });
      return id;
    };

    it("guarda a execução e os passos na ordem, com a saída em JSON intacta", async () => {
      const id = await novaExecucao();
      await repo.gravarPasso(id, passo("coleta"));
      await repo.gravarPasso(
        id,
        passo("redacao", { status: "falha", erro: "deu ruim", saida: null }),
      );
      await repo.atualizarStatus(id, "falhou");

      const execucao = await repo.buscarExecucao(id);
      expect(execucao?.status).toBe("falhou");
      expect(execucao?.data).toBe("2026-11-05");
      expect(execucao?.passos.map((p) => p.passo)).toEqual(["coleta", "redacao"]);
      expect(execucao?.passos[0]?.saida).toEqual({
        itens: 412,
        lista: ["a", "b"],
        aninhado: { ok: true },
      });
      expect(execucao?.passos[1]).toMatchObject({ status: "falha", erro: "deu ruim", saida: null });
    });

    it("execução inexistente: buscar dá nulo e atualizar dá erro", async () => {
      expect(await repo.buscarExecucao(randomUUID())).toBeNull();
      await expect(repo.atualizarStatus(randomUUID(), "ok")).rejects.toThrow();
    });

    it("a última execução é a mais recente", async () => {
      const antiga = await novaExecucao(randomUUID(), "2026-11-03");
      const nova = await novaExecucao(randomUUID(), "2026-11-05");
      expect((await repo.ultimaExecucao())?.id).toBe(nova);
      expect(antiga).not.toBe(nova);
    });

    it("livro-caixa: soma o gasto do mês de São Paulo, não o do UTC", async () => {
      const id = await novaExecucao();
      await repo.gravarUso(id, "redacao", uso(0.5), "2026-11-04T12:00:00.000Z");
      await repo.gravarUso(id, "tema", uso(0.25), "2026-11-30T20:00:00.000Z");
      // 02:00 UTC de 1º de dezembro ainda é 23:00 de 30/11 em São Paulo: conta em novembro.
      await repo.gravarUso(id, "tema", uso(0.125), "2026-12-01T02:00:00.000Z");
      // 03:00 UTC de 1º de dezembro já é 00:00 em São Paulo: conta em dezembro.
      await repo.gravarUso(id, "tema", uso(4), "2026-12-01T03:00:00.000Z");
      expect(await repo.gastoDoMesUsd("2026-11")).toBeCloseTo(0.875, 6);
      expect(await repo.gastoDoMesUsd("2026-12")).toBeCloseTo(4, 6);
      expect(await repo.gastoDoMesUsd("2026-10")).toBe(0);
    });

    it("briefing: versões crescentes por data, e o último vence", async () => {
      const id = await novaExecucao();
      const base = briefingExemplo();
      const gravar = (data: string, titulo: string) =>
        repo.gravarBriefing({
          data,
          execucaoId: id,
          tipo: "diaria",
          criadoEm: `${data}T09:30:00.000Z`,
          briefing: { ...base, data, historiaDoDia: { ...base.historiaDoDia, titulo } },
          avisos: ["um aviso"],
        });
      expect(await gravar("2026-11-05", "primeiro")).toBe(1);
      expect(await gravar("2026-11-05", "segundo")).toBe(2);
      expect(await gravar("2026-11-06", "outro dia")).toBe(1);

      expect((await repo.briefingDaData("2026-11-05"))?.briefing.historiaDoDia.titulo).toBe(
        "segundo",
      );
      expect((await repo.ultimoBriefing())?.data).toBe("2026-11-06");
      expect(await repo.briefingDaData("2026-01-01")).toBeNull();
    });

    it("briefing: volta do repositório igual ao que foi gravado", async () => {
      const id = await novaExecucao();
      const briefing = briefingExemplo();
      await repo.gravarBriefing({
        data: briefing.data,
        execucaoId: id,
        tipo: "diaria",
        criadoEm: "2026-11-05T09:30:00.000Z",
        briefing,
        avisos: ["a", "b"],
      });
      const lido = await repo.ultimoBriefing();
      expect(lido?.briefing).toEqual(briefing);
      expect(lido?.avisos).toEqual(["a", "b"]);
      expect(lido?.execucaoId).toBe(id);
      expect(lido?.criadoEm).toBe("2026-11-05T09:30:00.000Z");
    });

    it("sem nenhum briefing, o último é nulo", async () => {
      expect(await repo.ultimoBriefing()).toBeNull();
    });

    // --- Etapa 2: uma execução por vez, limites, histórico e acesso por dispositivo ---

    const executar = async (
      id: string,
      criadaEm: string,
      extras: {
        tipo?: "diaria" | "atualizacao";
        status?: "ok" | "falhou" | "rodando";
        data?: string;
      } = {},
    ) => {
      const data = extras.data ?? criadaEm.slice(0, 10);
      await repo.criarExecucao({ id, data, tipo: extras.tipo ?? "diaria", criadaEm });
      if (extras.status !== "rodando") await repo.atualizarStatus(id, extras.status ?? "ok");
      return id;
    };

    describe("uma execução paga por vez", () => {
      it("com uma rodando, a segunda é recusada; ao terminar, outra pode começar", async () => {
        const primeira = await executar(randomUUID(), "2026-11-05T09:00:00.000Z", {
          status: "rodando",
        });
        await expect(
          repo.criarExecucao({
            id: randomUUID(),
            data: "2026-11-05",
            tipo: "atualizacao",
            criadaEm: "2026-11-05T09:05:00.000Z",
          }),
        ).rejects.toBeInstanceOf(ExecucaoEmAndamento);
        expect((await repo.execucaoEmAndamento())?.id).toBe(primeira);

        await repo.atualizarStatus(primeira, "ok");
        expect(await repo.execucaoEmAndamento()).toBeNull();
        await executar(randomUUID(), "2026-11-05T09:10:00.000Z", { status: "rodando" });
      });

      it("execuções simultâneas: só uma entra", async () => {
        const resultados = await Promise.allSettled(
          Array.from({ length: 8 }, () =>
            repo.criarExecucao({
              id: randomUUID(),
              data: "2026-11-05",
              tipo: "atualizacao",
              criadaEm: "2026-11-05T09:00:00.000Z",
            }),
          ),
        );
        expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        for (const r of resultados) {
          if (r.status === "rejected") expect(r.reason).toBeInstanceOf(ExecucaoEmAndamento);
        }
      });

      it("execução órfã (mais de 30 minutos) vira falha e não prende a trava", async () => {
        const orfa = await executar(randomUUID(), "2026-11-05T09:00:00.000Z", {
          status: "rodando",
        });
        await executar(randomUUID(), "2026-11-05T09:31:00.000Z", { status: "rodando" });
        expect((await repo.buscarExecucao(orfa))?.status).toBe("falhou");
      });

      it("encerrarOrfas só pega as rodando criadas antes do instante", async () => {
        const velha = await executar(randomUUID(), "2026-11-05T09:00:00.000Z", {
          status: "rodando",
        });
        expect(await repo.encerrarOrfas("2026-11-05T08:59:00.000Z")).toBe(0);
        expect(await repo.encerrarOrfas("2026-11-05T09:01:00.000Z")).toBe(1);
        expect((await repo.buscarExecucao(velha))?.status).toBe("falhou");
        expect(await repo.encerrarOrfas("2026-11-05T12:00:00.000Z")).toBe(0);
      });
    });

    it("execucoesDaData devolve só a data pedida, da mais antiga à mais nova", async () => {
      const b = await executar(randomUUID(), "2026-11-05T09:40:00.000Z", { tipo: "atualizacao" });
      const a = await executar(randomUUID(), "2026-11-05T09:00:00.000Z");
      await executar(randomUUID(), "2026-11-06T09:00:00.000Z");
      const lista = await repo.execucoesDaData("2026-11-05");
      expect(lista.map((e) => e.id)).toEqual([a, b]);
      expect(lista[1]).toMatchObject({ tipo: "atualizacao", status: "ok", data: "2026-11-05" });
      expect(await repo.execucoesDaData("2026-01-01")).toEqual([]);
    });

    it("histórico: a última versão de cada data, da mais recente, com limite", async () => {
      const id = await executar(randomUUID(), "2026-11-05T09:00:00.000Z");
      const base = briefingExemplo();
      const gravar = (data: string, titulo: string) =>
        repo.gravarBriefing({
          data,
          execucaoId: id,
          tipo: "diaria",
          criadoEm: `${data}T09:30:00.000Z`,
          briefing: { ...base, data, historiaDoDia: { ...base.historiaDoDia, titulo } },
          avisos: [],
        });
      await gravar("2026-11-03", "dia 3");
      await gravar("2026-11-04", "dia 4 v1");
      await gravar("2026-11-04", "dia 4 v2");
      await gravar("2026-11-05", "dia 5");
      const todos = await repo.historico(30);
      expect(todos.map((r) => [r.data, r.briefing.historiaDoDia.titulo])).toEqual([
        ["2026-11-05", "dia 5"],
        ["2026-11-04", "dia 4 v2"],
        ["2026-11-03", "dia 3"],
      ]);
      expect((await repo.historico(2)).map((r) => r.data)).toEqual(["2026-11-05", "2026-11-04"]);
      await repo.atualizarStatus(id, "ok");
    });

    it("custo médio diário: média das diárias ok mais recentes; ignora atualização e falha", async () => {
      expect(await repo.custoMedioDiarioUsd(7)).toBeNull();
      const gastar = async (id: string, usd: number) =>
        repo.gravarUso(id, "redacao", uso(usd), "2026-11-04T12:00:00.000Z");
      await gastar(await executar(randomUUID(), "2026-11-01T09:00:00.000Z"), 0.9);
      await gastar(await executar(randomUUID(), "2026-11-02T09:00:00.000Z"), 0.3);
      await gastar(await executar(randomUUID(), "2026-11-03T09:00:00.000Z"), 0.5);
      await gastar(
        await executar(randomUUID(), "2026-11-03T15:00:00.000Z", { tipo: "atualizacao" }),
        9,
      );
      await gastar(
        await executar(randomUUID(), "2026-11-04T09:00:00.000Z", { status: "falhou" }),
        7,
      );
      expect(await repo.custoMedioDiarioUsd(7)).toBeCloseTo((0.9 + 0.3 + 0.5) / 3, 6);
      // Só as 2 mais recentes: 11/03 (0,5) e 11/02 (0,3).
      expect(await repo.custoMedioDiarioUsd(2)).toBeCloseTo(0.4, 6);
    });

    describe("códigos de pareamento", () => {
      const agora = "2026-11-05T09:00:00.000Z";
      const guardar = (hash = "h-codigo", expiraEm = "2026-11-05T09:10:00.000Z") =>
        repo.guardarCodigo({ codigoHash: hash, criadoEm: agora, expiraEm });

      it("vale uma vez só", async () => {
        await guardar();
        expect(await repo.consumirCodigo("h-codigo", agora)).toBe(true);
        expect(await repo.consumirCodigo("h-codigo", agora)).toBe(false);
      });

      it("simultâneos com o mesmo código: só um consome", async () => {
        await guardar();
        const resultados = await Promise.all(
          Array.from({ length: 6 }, () => repo.consumirCodigo("h-codigo", agora)),
        );
        expect(resultados.filter(Boolean)).toHaveLength(1);
      });

      it("expira, e código desconhecido não consome nada", async () => {
        await guardar();
        expect(await repo.consumirCodigo("h-codigo", "2026-11-05T09:10:00.000Z")).toBe(false);
        expect(await repo.consumirCodigo("outro", agora)).toBe(false);
      });

      it("depois de 5 tentativas erradas, o código morre mesmo sendo o certo", async () => {
        await guardar();
        for (let i = 0; i < MAX_TENTATIVAS_DE_CODIGO; i++) {
          await repo.registrarFalhaDePareamento(agora);
        }
        expect(await repo.consumirCodigo("h-codigo", agora)).toBe(false);
      });

      it("com 4 tentativas erradas ainda funciona", async () => {
        await guardar();
        for (let i = 0; i < MAX_TENTATIVAS_DE_CODIGO - 1; i++) {
          await repo.registrarFalhaDePareamento(agora);
        }
        expect(await repo.consumirCodigo("h-codigo", agora)).toBe(true);
      });

      it("as tentativas erradas só queimam os códigos ainda válidos", async () => {
        await guardar("expirado", "2026-11-05T08:59:00.000Z");
        await guardar("valido");
        for (let i = 0; i < MAX_TENTATIVAS_DE_CODIGO; i++) {
          await repo.registrarFalhaDePareamento(agora);
        }
        expect(await repo.consumirCodigo("valido", agora)).toBe(false);
      });
    });

    describe("dispositivos", () => {
      const novo = (nome: string, hash: string) => ({
        id: randomUUID(),
        nome,
        tokenHash: hash,
        criadoEm: "2026-11-05T09:00:00.000Z",
      });

      it("cria, busca pelo hash do token e nunca mistura tokens", async () => {
        const celular = novo("Celular", "hash-a");
        await repo.criarDispositivo(celular);
        await repo.criarDispositivo(novo("Notebook", "hash-b"));
        const achado = await repo.buscarDispositivoPorToken("hash-a");
        expect(achado).toMatchObject({
          id: celular.id,
          nome: "Celular",
          tokenHash: "hash-a",
          ultimoUsoEm: null,
          revogadoEm: null,
        });
        expect(await repo.buscarDispositivoPorToken("hash-z")).toBeNull();
      });

      it("não aceita dois dispositivos com o mesmo hash", async () => {
        await repo.criarDispositivo(novo("A", "mesmo"));
        await expect(repo.criarDispositivo(novo("B", "mesmo"))).rejects.toThrow();
      });

      it("a listagem nunca traz o hash do token", async () => {
        await repo.criarDispositivo(novo("Celular", "segredo-do-hash"));
        const lista = await repo.listarDispositivos();
        expect(lista).toHaveLength(1);
        expect(JSON.stringify(lista)).not.toContain("segredo-do-hash");
      });

      it("registra o último uso e revoga uma vez só", async () => {
        const d = novo("Celular", "hash-a");
        await repo.criarDispositivo(d);
        await repo.registrarUsoDoDispositivo(d.id, "2026-11-06T10:00:00.000Z");
        expect((await repo.buscarDispositivoPorToken("hash-a"))?.ultimoUsoEm).toBe(
          "2026-11-06T10:00:00.000Z",
        );
        expect(await repo.revogarDispositivo(d.id, "2026-11-07T10:00:00.000Z")).toBe(true);
        expect(await repo.revogarDispositivo(d.id, "2026-11-08T10:00:00.000Z")).toBe(false);
        expect(await repo.revogarDispositivo(randomUUID(), "2026-11-08T10:00:00.000Z")).toBe(false);
        expect((await repo.buscarDispositivoPorToken("hash-a"))?.revogadoEm).toBe(
          "2026-11-07T10:00:00.000Z",
        );
      });
    });
  });
}

const pastas: string[] = [];
afterAll(() => {
  for (const pasta of pastas) rmSync(pasta, { recursive: true, force: true });
});

contrato("memória", async () => ({ repo: new RepositorioEmMemoria(), limpar: async () => {} }));

contrato("arquivo local", async () => {
  const pasta = mkdtempSync(join(tmpdir(), "arauto-repo-"));
  pastas.push(pasta);
  return { repo: new RepositorioEmArquivo(join(pasta, "estado.json")), limpar: async () => {} };
});

// O Postgres só é testado quando há um banco de testes. No CI, é o serviço do workflow; em casa,
// o `docker compose up -d` ou qualquer Postgres vazio. ATENÇÃO: o teste APAGA os dados do banco.
const urlDeTeste = process.env.DATABASE_URL_TESTE;
if (urlDeTeste) {
  const sql = conectar(urlDeTeste);
  afterAll(() => sql.end({ timeout: 5 }));

  contrato("Postgres", async () => {
    await migrar(sql);
    return {
      repo: new RepositorioPostgres(sql),
      limpar: async () => {
        await sql`truncate briefings, uso_modelo, passos, execucoes, dispositivos, codigos_pareamento restart identity cascade`;
      },
    };
  });

  describe("migrações no Postgres", () => {
    it("aplicar de novo não faz nada, e as tabelas existem", async () => {
      await migrar(sql);
      expect(await migrar(sql)).toEqual([]);
      const tabelas = await sql<{ table_name: string }[]>`
        select table_name from information_schema.tables where table_schema = 'public'`;
      expect(tabelas.map((t) => t.table_name)).toEqual(
        expect.arrayContaining([
          "execucoes",
          "passos",
          "uso_modelo",
          "briefings",
          "dispositivos",
          "codigos_pareamento",
          "_migracoes",
        ]),
      );
    });

    it("recusa dado fora das regras do banco (status inválido, passo com tentativa 4)", async () => {
      const repo = new RepositorioPostgres(sql);
      const id = randomUUID();
      await repo.criarExecucao({
        id,
        data: "2026-11-05",
        tipo: "diaria",
        criadaEm: "2026-11-05T09:00:00.000Z",
      });
      await expect(sql`update execucoes set status = 'talvez' where id = ${id}`).rejects.toThrow();
      await expect(repo.gravarPasso(id, passo("coleta", { tentativa: 4 }))).rejects.toThrow();
    });
  });
} else {
  describe.skip("repositório: Postgres (defina DATABASE_URL_TESTE para rodar)", () => {
    it("pulado", () => {});
  });
}
