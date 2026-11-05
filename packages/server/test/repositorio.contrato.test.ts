import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { RepositorioEmArquivo } from "../src/repo/arquivo.js";
import { RepositorioEmMemoria } from "../src/repo/memoria.js";
import { migrar } from "../src/repo/migrar.js";
import { conectar, RepositorioPostgres } from "../src/repo/postgres.js";
import type { Repositorio } from "../src/repo/repositorio.js";
import { briefingExemplo } from "./briefing-exemplo.js";

interface Ambiente {
  repo: Repositorio;
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
    let repo: Repositorio;
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
        await sql`truncate briefings, uso_modelo, passos, execucoes restart identity cascade`;
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
        expect.arrayContaining(["execucoes", "passos", "uso_modelo", "briefings", "_migracoes"]),
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
