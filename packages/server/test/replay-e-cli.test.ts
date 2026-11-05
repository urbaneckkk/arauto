import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { formatarBriefing } from "../src/cli/formatar.js";
import { PERFIS } from "../src/config/env.js";
import { logSilencioso } from "../src/infra/log.js";
import { TransporteGravador, TransporteReplay } from "../src/infra/transporte.js";
import { ClienteGravador, ClienteReplay } from "../src/modelos/gravacao.js";
import { semPausa } from "../src/passos/tipos.js";
import { executarPipeline } from "../src/pipeline/executar.js";
import { briefingExemplo } from "./briefing-exemplo.js";
import { envDeTeste, modeloDoMundo, novoRepo, relogio, transporteDoMundo } from "./mundo.js";

const pastas: string[] = [];
afterEach(() => {
  for (const pasta of pastas.splice(0)) rmSync(pasta, { recursive: true, force: true });
});

describe("gravar e repetir uma execução inteira", () => {
  it("o replay reproduz o mesmo briefing sem tocar na internet nem no modelo", async () => {
    const pasta = mkdtempSync(join(tmpdir(), "arauto-gravacao-"));
    pastas.push(pasta);

    // 1. Execução "real" (aqui, com o mundo de mentira por baixo), gravando tudo.
    const transporteReal = transporteDoMundo();
    const modeloReal = modeloDoMundo();
    const gravada = await executarPipeline({
      repo: novoRepo(),
      transporte: new TransporteGravador(transporteReal, pasta),
      clienteBase: new ClienteGravador(modeloReal, pasta),
      relogio,
      log: logSilencioso,
      env: envDeTeste,
      perfil: PERFIS.padrao,
      pausa: semPausa,
    });
    expect(gravada.status).toBe("ok");
    const chamadasDaInternet = transporteReal.chamadas.length;
    const chamadasDoModelo = modeloReal.chamadas.length;
    expect(chamadasDaInternet).toBeGreaterThan(0);
    expect(chamadasDoModelo).toBeGreaterThan(0);

    // 2. Replay: nada de internet, nada de modelo.
    const replay = await executarPipeline({
      repo: novoRepo(),
      transporte: new TransporteReplay(pasta),
      clienteBase: new ClienteReplay(pasta),
      relogio,
      log: logSilencioso,
      env: envDeTeste,
      perfil: PERFIS.padrao,
      pausa: semPausa,
    });
    expect(replay.status).toBe("ok");
    expect(replay.briefing).toEqual(gravada.briefing);
    expect(replay.gastoUsd).toBeCloseTo(gravada.gastoUsd, 6);
    // Os "mundos de mentira" não foram chamados de novo.
    expect(transporteReal.chamadas).toHaveLength(chamadasDaInternet);
    expect(modeloReal.chamadas).toHaveLength(chamadasDoModelo);
  });

  it("repete também as falhas gravadas (tentativa que deu erro e foi repetida)", async () => {
    const pasta = mkdtempSync(join(tmpdir(), "arauto-gravacao-"));
    pastas.push(pasta);
    const { ClienteFalso, respostaDeTexto } = await import("../src/modelos/falso.js");
    const { agrupamentoFalso, apuracaoFalsa, redacaoFalsa, temaFalso, SONNET } = await import(
      "./mundo.js"
    );
    const modelo = new ClienteFalso({
      termometro: agrupamentoFalso,
      apuracao: apuracaoFalsa,
      redacao: [respostaDeTexto(SONNET, "lixo, não é json"), redacaoFalsa],
      tema: temaFalso(),
    });
    const deps = {
      log: logSilencioso,
      env: envDeTeste,
      perfil: PERFIS.padrao,
      pausa: semPausa,
      relogio,
    };
    const gravada = await executarPipeline({
      ...deps,
      repo: novoRepo(),
      transporte: new TransporteGravador(transporteDoMundo(), pasta),
      clienteBase: new ClienteGravador(modelo, pasta),
    });
    const replay = await executarPipeline({
      ...deps,
      repo: novoRepo(),
      transporte: new TransporteReplay(pasta),
      clienteBase: new ClienteReplay(pasta),
    });
    expect(gravada.status).toBe("ok");
    expect(replay.passos.map((p) => `${p.passo}:${p.status}`)).toEqual(
      gravada.passos.map((p) => `${p.passo}:${p.status}`),
    );
    expect(replay.briefing).toEqual(gravada.briefing);
  });

  it("replay sem gravação do modelo falha com mensagem clara, sem inventar resposta", async () => {
    const pasta = mkdtempSync(join(tmpdir(), "arauto-vazia-"));
    pastas.push(pasta);
    const resultado = await executarPipeline({
      repo: novoRepo(),
      transporte: transporteDoMundo(),
      clienteBase: new ClienteReplay(pasta),
      relogio,
      log: logSilencioso,
      env: envDeTeste,
      perfil: PERFIS.padrao,
      pausa: semPausa,
    });
    expect(resultado.status).toBe("falhou");
    expect(resultado.erro).toContain("Sem gravação do modelo");
  });
});

describe("brief:ver (formatação)", () => {
  const registro = {
    data: "2026-11-05",
    versao: 2,
    execucaoId: "e1",
    tipo: "diaria" as const,
    criadoEm: "2026-11-05T09:30:00.000Z",
    briefing: briefingExemplo(),
    avisos: ["Feed parado: algum feed"],
  };

  it("mostra as partes do briefing, as fontes e o rodapé de leitura e custo", () => {
    const texto = formatarBriefing(registro, { hoje: "2026-11-05" });
    for (const trecho of [
      "briefing de 05/11/2026 (versão 2)",
      "EM 30 SEGUNDOS",
      "1. Primeira.",
      "TEMPO EM CURITIBA",
      "17.8–26.1 °C · chance de chuva 85%",
      "HISTÓRIA DO DIA — Prefeitura anuncia obras",
      "## politica",
      "O que aconteceu:",
      "Por que importa:",
      "https://g1.globo.com/politica/noticia/evento-1",
      "## curiosidade",
      "Leitura:",
      "Custo: US$ 0.4000 · 2 buscas",
      "Feed parado: algum feed",
    ]) {
      expect(texto, trecho).toContain(trecho);
    }
    expect(texto).not.toContain("Não há briefing de hoje");
  });

  it("avisa com clareza quando o briefing não é de hoje", () => {
    const texto = formatarBriefing(registro, { hoje: "2026-11-06" });
    expect(texto).toContain("Não há briefing de hoje (06/11/2026)");
    expect(texto).toContain("último disponível, de 05/11/2026");
  });

  it("sem previsão, diz que está indisponível em vez de mostrar números", () => {
    const sem = {
      ...registro,
      briefing: {
        ...registro.briefing,
        tempo: { ...registro.briefing.tempo, minC: null, maxC: null, chuvaPct: null },
      },
    };
    expect(formatarBriefing(sem, { hoje: "2026-11-05" })).toContain("Previsão indisponível");
  });

  it("mostra o alerta com nível e fonte", () => {
    const comAlerta = {
      ...registro,
      briefing: {
        ...registro.briefing,
        tempo: {
          ...registro.briefing.tempo,
          alertas: [
            {
              fonte: "inmet" as const,
              tipo: "Tempestade",
              nivel: "laranja" as const,
              inicio: "2026-11-05T09:00:00-03:00",
              fim: "2026-11-05T23:59:00-03:00",
            },
          ],
        },
      },
    };
    expect(formatarBriefing(comAlerta, { hoje: "2026-11-05" })).toContain("LARANJA · Tempestade");
  });
});
