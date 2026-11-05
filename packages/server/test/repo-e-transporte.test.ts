import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Briefing, UsoDeModelo } from "@arauto/core";
import { afterEach, describe, expect, it } from "vitest";
import {
  type RespostaHttp,
  type Transporte,
  TransporteGravador,
  TransporteReplay,
} from "../src/infra/transporte.js";
import { RepositorioEmArquivo } from "../src/repo/arquivo.js";
import { RepositorioEmMemoria } from "../src/repo/memoria.js";

const pastas: string[] = [];
function pastaTemporaria(): string {
  const pasta = mkdtempSync(join(tmpdir(), "arauto-teste-"));
  pastas.push(pasta);
  return pasta;
}
afterEach(() => {
  for (const pasta of pastas.splice(0)) rmSync(pasta, { recursive: true, force: true });
});

const briefingFalso = { data: "2026-11-04" } as unknown as Briefing;

const uso = (usd: number): UsoDeModelo => ({
  modelo: "claude-haiku-5-5",
  tokensEntrada: 1,
  tokensSaida: 1,
  tokensCacheLeitura: 0,
  buscas: 0,
  usd,
});

describe("repositório em memória", () => {
  it("numera as versões do briefing da mesma data", async () => {
    const repo = new RepositorioEmMemoria();
    const novo = (data: string) => ({
      data,
      execucaoId: "e1",
      tipo: "diaria" as const,
      criadoEm: "2026-11-04T09:00:00Z",
      briefing: { ...briefingFalso, data },
      avisos: [],
    });
    expect(await repo.gravarBriefing(novo("2026-11-04"))).toBe(1);
    expect(await repo.gravarBriefing(novo("2026-11-04"))).toBe(2);
    expect(await repo.gravarBriefing(novo("2026-11-05"))).toBe(1);
    expect((await repo.briefingDaData("2026-11-04"))?.versao).toBe(2);
    expect((await repo.ultimoBriefing())?.data).toBe("2026-11-05");
    expect(await repo.briefingDaData("2026-01-01")).toBeNull();
  });

  it("soma o gasto só do mês pedido", async () => {
    const repo = new RepositorioEmMemoria();
    await repo.gravarUso("e1", "redacao", uso(0.12), "2026-11-04T09:00:00Z");
    await repo.gravarUso("e1", "tema", uso(0.003), "2026-11-04T09:01:00Z");
    await repo.gravarUso("e0", "redacao", uso(5), "2026-10-31T09:00:00Z");
    expect(await repo.gastoDoMesUsd("2026-11")).toBeCloseTo(0.123, 6);
    expect(await repo.gastoDoMesUsd("2026-10")).toBe(5);
    expect(await repo.gastoDoMesUsd("2026-09")).toBe(0);
  });

  it("guarda a execução, os passos e o status", async () => {
    const repo = new RepositorioEmMemoria();
    await repo.criarExecucao({
      id: "e1",
      data: "2026-11-04",
      tipo: "diaria",
      criadaEm: "2026-11-04T09:00:00Z",
    });
    await repo.atualizarStatus("e1", "ok");
    const execucao = await repo.buscarExecucao("e1");
    expect(execucao?.status).toBe("ok");
    expect((await repo.ultimaExecucao())?.id).toBe("e1");
    await expect(repo.atualizarStatus("inexistente", "ok")).rejects.toThrow();
  });
});

describe("repositório em arquivo", () => {
  it("lembra o gasto depois de reiniciar (a trava mensal vale sem banco)", async () => {
    const arquivo = join(pastaTemporaria(), "estado.json");
    const primeiro = new RepositorioEmArquivo(arquivo);
    await primeiro.gravarUso("e1", "redacao", uso(1.5), "2026-11-04T09:00:00Z");
    expect(existsSync(arquivo)).toBe(true);

    const segundo = new RepositorioEmArquivo(arquivo);
    expect(await segundo.gastoDoMesUsd("2026-11")).toBe(1.5);
  });
});

describe("transporte: gravar e repetir", () => {
  const resposta: RespostaHttp = { status: 200, contentType: "application/xml", corpo: "<rss/>" };

  function transporteFalso(): Transporte & { chamadas: string[] } {
    const chamadas: string[] = [];
    return {
      chamadas,
      async get(url) {
        chamadas.push(url);
        if (url.includes("fora")) throw new Error("rede caiu");
        return resposta;
      },
      async verificar(url) {
        chamadas.push(`verificar ${url}`);
        return { status: url.includes("morto") ? 404 : 200, urlFinal: `${url}/final` };
      },
    };
  }

  it("o replay devolve o que foi gravado, sem tocar na rede", async () => {
    const pasta = pastaTemporaria();
    const real = transporteFalso();
    const gravador = new TransporteGravador(real, pasta);
    await gravador.get("https://exemplo.com/feed");
    expect(await gravador.verificar("https://exemplo.com/ok")).toEqual({
      status: 200,
      urlFinal: "https://exemplo.com/ok/final",
    });
    expect((await gravador.verificar("https://exemplo.com/morto")).status).toBe(404);

    const replay = new TransporteReplay(pasta);
    expect(await replay.get("https://exemplo.com/feed")).toEqual(resposta);
    expect(await replay.verificar("https://exemplo.com/ok")).toEqual({
      status: 200,
      urlFinal: "https://exemplo.com/ok/final",
    });
    expect((await replay.verificar("https://exemplo.com/morto")).status).toBe(404);
    expect(real.chamadas).toHaveLength(3); // o replay não gerou chamada nova
  });

  it("repete também a falha de rede", async () => {
    const pasta = pastaTemporaria();
    const gravador = new TransporteGravador(transporteFalso(), pasta);
    await expect(gravador.get("https://exemplo.com/fora")).rejects.toThrow("rede caiu");
    await expect(new TransporteReplay(pasta).get("https://exemplo.com/fora")).rejects.toThrow(
      "rede caiu",
    );
  });

  it("o que não foi gravado falha como rede caída", async () => {
    const replay = new TransporteReplay(pastaTemporaria());
    await expect(replay.get("https://exemplo.com/nunca")).rejects.toThrow(/Sem gravação/);
    expect(await replay.verificar("https://exemplo.com/nunca")).toEqual({
      status: 0,
      urlFinal: "https://exemplo.com/nunca",
    });
  });
});
