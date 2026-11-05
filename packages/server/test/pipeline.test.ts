import { describe, expect, it } from "vitest";
import { PERFIS } from "../src/config/env.js";
import { logSilencioso } from "../src/infra/log.js";
import { RespostaInvalida } from "../src/modelos/cliente.js";
import { ClienteFalso, respostaDeTexto } from "../src/modelos/falso.js";
import { semPausa } from "../src/passos/tipos.js";
import {
  type DependenciasDoPipeline,
  executarPipeline,
  MINIMO_DE_ITENS,
} from "../src/pipeline/executar.js";
import { ok, rss, transporteDeMapa } from "./ajudantes.js";
import {
  agrupamentoFalso,
  apuracaoFalsa,
  envDeTeste,
  HAIKU,
  haAlgumasHoras,
  modeloDoMundo,
  novoRepo,
  redacaoFalsa,
  relogio,
  SONNET,
  temaFalso,
  transporteDoMundo,
  URL_AGBR,
  URL_G1,
} from "./mundo.js";

function montar(extras: Partial<DependenciasDoPipeline> = {}): DependenciasDoPipeline {
  return {
    repo: novoRepo(),
    transporte: transporteDoMundo(),
    clienteBase: modeloDoMundo(),
    relogio,
    log: logSilencioso,
    env: envDeTeste,
    perfil: PERFIS.padrao,
    pausa: semPausa,
    gerarId: () => "execucao-de-teste",
    ...extras,
  };
}

const nomesDosPassos = (r: { passos: { passo: string; status: string }[] }) =>
  r.passos.map((p) => `${p.passo}:${p.status}`);

describe("pipeline completo (caminho feliz)", () => {
  it("coleta, pontua, apura, redige, verifica, escolhe o tema e publica", async () => {
    const deps = montar();
    const resultado = await executarPipeline(deps);

    expect(resultado.erro).toBeNull();
    expect(resultado.status).toBe("ok");
    expect(nomesDosPassos(resultado)).toEqual([
      "coleta:ok",
      "termometro:ok",
      "apuracao:ok",
      "redacao:ok",
      "verificacao:ok",
      "tema:ok",
      "publicacao:ok",
    ]);

    const briefing = resultado.briefing;
    expect(briefing?.data).toBe("2026-11-05");
    expect(briefing?.tema.id).toBe("politica");
    expect(briefing?.historiaDoDia.pontuacaoParcial).toBe(true);
    expect(briefing?.secoes.map((s) => s.id)).toEqual(["politica", "economia"]);
    expect(briefing?.curiosidade?.titulo).toContain("Obra 4");
  });

  it("os números do tempo e os alertas vêm das fontes oficiais, nunca do modelo", async () => {
    const resultado = await executarPipeline(montar());
    const tempo = resultado.briefing?.tempo;
    expect(tempo?.minC).toBe(17.8);
    expect(tempo?.maxC).toBe(26.1);
    expect(tempo?.chuvaPct).toBe(85);
    expect(tempo?.resumo).toBe("Dia chuvoso, com alerta de tempestade.");
    expect(tempo?.alertas).toHaveLength(1);
    expect(tempo?.alertas[0]).toMatchObject({
      fonte: "inmet",
      nivel: "laranja",
      tipo: "Tempestade",
    });
    // Só os campos do contrato: nada de riscos ou instruções vazando.
    expect(Object.keys(tempo?.alertas[0] ?? {}).sort()).toEqual([
      "fim",
      "fonte",
      "inicio",
      "nivel",
      "tipo",
      "url",
    ]);
  });

  it("cada notícia leva fontes reais, dentro das 36 horas e da lista branca", async () => {
    const resultado = await executarPipeline(montar());
    const fontes =
      resultado.briefing?.secoes.flatMap((s) => s.noticias.flatMap((n) => n.fontes)) ?? [];
    expect(fontes.length).toBeGreaterThanOrEqual(3);
    for (const fonte of fontes) {
      expect(fonte.url).toMatch(/^https:\/\/(g1\.globo\.com|agenciabrasil\.ebc\.com\.br)\//);
      expect(Date.parse(fonte.publicadoEm)).toBeGreaterThan(Date.now() - 400 * 24 * 3_600_000);
    }
  });

  it("grava o briefing, o livro-caixa e todos os passos para depuração", async () => {
    const deps = montar();
    const resultado = await executarPipeline(deps);

    const salvo = await deps.repo.ultimoBriefing();
    expect(salvo?.briefing).toEqual(resultado.briefing);
    expect(salvo?.versao).toBe(1);

    const execucao = await deps.repo.buscarExecucao("execucao-de-teste");
    expect(execucao?.status).toBe("ok");
    expect(execucao?.passos).toHaveLength(7);

    expect(resultado.gastoUsd).toBeGreaterThan(0.1);
    expect(await deps.repo.gastoDoMesUsd("2026-11")).toBeCloseTo(resultado.gastoUsd, 6);
    expect(resultado.briefing?.custo.usd).toBeCloseTo(resultado.gastoUsd, 6);
    expect(resultado.briefing?.custo.buscas).toBe(2);
  });

  it("avisa que a pontuação foi parcial quando o GDELT não respondeu", async () => {
    const resultado = await executarPipeline(montar());
    expect(resultado.avisos.some((a) => a.includes("Pontuação parcial"))).toBe(true);
  });

  it("mede a leitura do briefing", async () => {
    const resultado = await executarPipeline(montar());
    expect(resultado.leitura?.palavras).toBeGreaterThan(30);
  });
});

describe("falhas e tentativas", () => {
  it("coleta com poucos itens falha, tenta 3 vezes e não gasta nada", async () => {
    const modelo = modeloDoMundo();
    const resultado = await executarPipeline(
      montar({ transporte: transporteDeMapa({}), clienteBase: modelo }),
    );
    expect(resultado.status).toBe("falhou");
    expect(resultado.erro).toContain(`mínimo ${MINIMO_DE_ITENS}`);
    expect(nomesDosPassos(resultado)).toEqual(["coleta:falha", "coleta:falha", "coleta:falha"]);
    expect(modelo.chamadas).toHaveLength(0);
    expect(resultado.gastoUsd).toBe(0);
  });

  it("redação com JSON inválido é repetida, e a segunda tentativa vale", async () => {
    const modelo = new ClienteFalso({
      termometro: agrupamentoFalso,
      apuracao: apuracaoFalsa,
      redacao: [respostaDeTexto(SONNET, "isso não é json"), redacaoFalsa],
      tema: temaFalso(),
    });
    const resultado = await executarPipeline(montar({ clienteBase: modelo }));
    expect(resultado.status).toBe("ok");
    expect(nomesDosPassos(resultado).filter((p) => p.startsWith("redacao"))).toEqual([
      "redacao:falha",
      "redacao:ok",
    ]);
    // A segunda chamada recebe o motivo da primeira.
    const chamadas = modelo.chamadas.filter((c) => c.passo === "redacao");
    expect(chamadas[1]?.usuario).toContain("Correção necessária");
    expect(chamadas[1]?.usuario).toContain("não é JSON");
  });

  it("verificação que reprova devolve o motivo ao redator, que refaz", async () => {
    const semFontes = (chamada: Parameters<typeof redacaoFalsa>[0]) => {
      const base = JSON.parse(redacaoFalsa(chamada).texto);
      for (const secao of base.secoes) for (const n of secao.noticias) n.fontes = ["i999"];
      base.curiosidade = null;
      return respostaDeTexto(SONNET, JSON.stringify(base));
    };
    const modelo = new ClienteFalso({
      termometro: agrupamentoFalso,
      apuracao: apuracaoFalsa,
      redacao: [semFontes, redacaoFalsa],
      tema: temaFalso(),
    });
    const resultado = await executarPipeline(montar({ clienteBase: modelo }));
    expect(resultado.status).toBe("ok");
    expect(nomesDosPassos(resultado).filter((p) => p.startsWith("verificacao"))).toEqual([
      "verificacao:falha",
      "verificacao:ok",
    ]);
    const segunda = modelo.chamadas.filter((c) => c.passo === "redacao")[1];
    expect(segunda?.usuario).toContain("Nenhuma notícia sobreviveu");
  });

  it("depois de 3 redações reprovadas, o pipeline falha com o motivo", async () => {
    const sempreRuim = (chamada: Parameters<typeof redacaoFalsa>[0]) => {
      const base = JSON.parse(redacaoFalsa(chamada).texto);
      for (const secao of base.secoes) for (const n of secao.noticias) n.fontes = ["i999"];
      return respostaDeTexto(SONNET, JSON.stringify(base));
    };
    const modelo = new ClienteFalso({
      termometro: agrupamentoFalso,
      apuracao: apuracaoFalsa,
      redacao: sempreRuim,
      tema: temaFalso(),
    });
    const deps = montar({ clienteBase: modelo });
    const resultado = await executarPipeline(deps);
    expect(resultado.status).toBe("falhou");
    expect(resultado.erro).toContain("Nenhuma notícia sobreviveu");
    expect(modelo.chamadas.filter((c) => c.passo === "redacao")).toHaveLength(3);
    expect((await deps.repo.buscarExecucao("execucao-de-teste"))?.status).toBe("falhou");
    expect(await deps.repo.ultimoBriefing()).toBeNull();
  });

  it("apuração que falha não derruba o briefing: o RSS basta, e o aviso fica registrado", async () => {
    const modelo = new ClienteFalso({
      termometro: agrupamentoFalso,
      apuracao: new Error("busca fora do ar"),
      redacao: redacaoFalsa,
      tema: temaFalso(),
    });
    const resultado = await executarPipeline(montar({ clienteBase: modelo }));
    expect(resultado.status).toBe("ok");
    expect(resultado.avisos.some((a) => a.includes("Apuração por busca indisponível"))).toBe(true);
    const redacao = modelo.chamadas.find((c) => c.passo === "redacao");
    expect(redacao?.usuario).toContain("A apuração por busca não está disponível hoje");
    expect(nomesDosPassos(resultado).filter((p) => p.startsWith("apuracao"))).toHaveLength(3);
  });

  it("modelo que recusa (refusal) é falha do passo, nunca texto aproveitado", async () => {
    const modelo = new ClienteFalso({
      termometro: agrupamentoFalso,
      apuracao: apuracaoFalsa,
      redacao: respostaDeTexto(SONNET, '{"parece":"valido"}', { motivoDeParada: "refusal" }),
      tema: temaFalso(),
    });
    const resultado = await executarPipeline(montar({ clienteBase: modelo }));
    expect(resultado.status).toBe("falhou");
    expect(resultado.erro).toContain("recusou");
    // A chamada recusada foi cobrada e entrou no livro-caixa.
    expect(resultado.gastoUsd).toBeGreaterThan(0);
  });

  it("resposta cortada por max_tokens é repetida", async () => {
    const modelo = new ClienteFalso({
      termometro: agrupamentoFalso,
      apuracao: apuracaoFalsa,
      redacao: [
        respostaDeTexto(SONNET, '{"cortad', { motivoDeParada: "max_tokens" }),
        redacaoFalsa,
      ],
      tema: temaFalso(),
    });
    const resultado = await executarPipeline(montar({ clienteBase: modelo }));
    expect(resultado.status).toBe("ok");
    expect(resultado.passos.find((p) => p.passo === "redacao")?.erro).toContain("cortada");
  });

  it("tema que falha: publica com o tema neutro e avisa", async () => {
    const modelo = new ClienteFalso({
      termometro: agrupamentoFalso,
      apuracao: apuracaoFalsa,
      redacao: redacaoFalsa,
      tema: new RespostaInvalidaDeTeste(),
    });
    const resultado = await executarPipeline(montar({ clienteBase: modelo }));
    expect(resultado.status).toBe("ok");
    expect(resultado.briefing?.tema.id).toBe("neutro");
    expect(resultado.avisos.some((a) => a.includes("tema foi escolhido por segurança"))).toBe(true);
  });
});

class RespostaInvalidaDeTeste extends Error {
  constructor() {
    super("modelo indisponível");
  }
}

describe("segurança de tema no pipeline", () => {
  /** Troca o título do evento mais recente por uma manchete de tragédia. */
  function transporteComTragedia() {
    const manchete = (dominio: string, caminho: string) =>
      rss([
        {
          titulo: "Evento 1: queda de avião deixa 45 mortos no litoral",
          url: `https://${dominio}/${caminho}/evento-1`,
          data: haAlgumasHoras(0.5),
          resumo: "Resumo inventado.",
        },
        ...Array.from({ length: 25 }, (_, i) => ({
          titulo: `Evento ${i + 2}: obra fictícia ${i + 2}`,
          url: `https://${dominio}/${caminho}/evento-${i + 2}`,
          data: haAlgumasHoras(2 + i),
        })),
      ]);
    return transporteDoMundo({
      mapa: {
        [URL_AGBR]: ok(manchete("agenciabrasil.ebc.com.br", "geral/noticia")),
        [URL_G1]: ok(manchete("g1.globo.com", "politica/noticia")),
      },
    });
  }

  it("tragédia nas manchetes vira luto mesmo que o modelo proponha outro tema", async () => {
    const resultado = await executarPipeline(montar({ transporte: transporteComTragedia() }));
    expect(resultado.status).toBe("ok");
    expect(resultado.briefing?.tema.id).toBe("luto");
    expect(resultado.regrasDeTema).toContain("luto_por_manchetes");
    // O aviso alegre do modelo não acompanha o luto.
    expect(resultado.briefing?.tema.notificacao.titulo).toBe("Briefing de hoje");
    expect(resultado.avisos.some((a) => a.includes("Regras de segurança alteraram o tema"))).toBe(
      true,
    );
  });

  it("tragédia mesmo com o passo do tema fora do ar: luto, não neutro", async () => {
    const modelo = new ClienteFalso({
      termometro: agrupamentoFalso,
      apuracao: apuracaoFalsa,
      redacao: redacaoFalsa,
      tema: new RespostaInvalidaDeTeste(),
    });
    const resultado = await executarPipeline(
      montar({ transporte: transporteComTragedia(), clienteBase: modelo }),
    );
    expect(resultado.briefing?.tema.id).toBe("luto");
  });

  it("animal em sofrimento nunca vira ternura_animal, mesmo que o modelo proponha", async () => {
    const proposta = JSON.parse(temaFalso("ternura_animal").texto);
    proposta.sinais.animalEmSofrimento = true;
    const modelo = new ClienteFalso({
      termometro: agrupamentoFalso,
      apuracao: apuracaoFalsa,
      redacao: redacaoFalsa,
      tema: respostaDeTexto(HAIKU, JSON.stringify(proposta)),
    });
    const resultado = await executarPipeline(montar({ clienteBase: modelo }));
    expect(resultado.briefing?.tema.id).toBe("neutro");
  });

  it("míssil nuclear (ficha de sinais) vira nuclear, mesmo que o modelo proponha conflito", async () => {
    const proposta = JSON.parse(temaFalso("conflito").texto);
    proposta.sinais.escaladaMilitar = true;
    proposta.sinais.armaOuInstalacaoNuclear = true;
    const modelo = new ClienteFalso({
      termometro: agrupamentoFalso,
      apuracao: apuracaoFalsa,
      redacao: redacaoFalsa,
      tema: respostaDeTexto(HAIKU, JSON.stringify(proposta)),
    });
    const resultado = await executarPipeline(montar({ clienteBase: modelo }));
    expect(resultado.briefing?.tema.id).toBe("nuclear");
  });
});

describe("travas de custo", () => {
  it("trava por execução: para antes de estourar e avisa", async () => {
    const modelo = modeloDoMundo();
    const resultado = await executarPipeline(
      montar({ clienteBase: modelo, env: { ...envDeTeste, MAX_USD_POR_EXECUCAO: 0.05 } }),
    );
    expect(resultado.status).toBe("abortado_por_custo");
    expect(resultado.erro).toContain("trava");
    expect(resultado.briefing).toBeNull();
    // A apuração (a chamada cara) nem chegou a ser feita.
    expect(modelo.chamadas.map((c) => c.passo)).toEqual(["termometro"]);
    expect(resultado.gastoUsd).toBeLessThanOrEqual(0.05);
  });

  it("trava mensal: não roda se o mês já está no limite", async () => {
    const deps = montar();
    await deps.repo.gravarUso(
      "execucao-antiga",
      "redacao",
      {
        modelo: SONNET,
        tokensEntrada: 1,
        tokensSaida: 1,
        tokensCacheLeitura: 0,
        buscas: 0,
        usd: 24.99,
      },
      "2026-11-02T09:00:00.000Z",
    );
    const resultado = await executarPipeline(deps);
    expect(resultado.status).toBe("abortado_por_custo");
    expect(resultado.erro).toContain("por mês");
  });

  it("o gasto de outro mês não conta na trava mensal", async () => {
    const deps = montar();
    await deps.repo.gravarUso(
      "execucao-antiga",
      "redacao",
      {
        modelo: SONNET,
        tokensEntrada: 1,
        tokensSaida: 1,
        tokensCacheLeitura: 0,
        buscas: 0,
        usd: 24.99,
      },
      "2026-10-31T09:00:00.000Z",
    );
    expect((await executarPipeline(deps)).status).toBe("ok");
  });

  it("interruptor geral: nenhuma chamada paga é feita", async () => {
    const modelo = modeloDoMundo();
    const resultado = await executarPipeline(
      montar({ clienteBase: modelo, env: { ...envDeTeste, GASTOS_PAUSADOS: true } }),
    );
    expect(resultado.status).toBe("abortado_por_custo");
    expect(resultado.erro).toContain("GASTOS_PAUSADOS");
    expect(modelo.chamadas).toHaveLength(0);
    expect(resultado.gastoUsd).toBe(0);
  });

  it("trava de custo não é repetida como se fosse erro passageiro", async () => {
    const resultado = await executarPipeline(
      montar({ env: { ...envDeTeste, GASTOS_PAUSADOS: true } }),
    );
    expect(resultado.passos.filter((p) => p.passo === "termometro")).toHaveLength(1);
  });

  it("o gasto do mês acumula de uma execução para a outra", async () => {
    const repo = novoRepo();
    const primeira = await executarPipeline(montar({ repo, gerarId: () => "a" }));
    const segunda = await executarPipeline(montar({ repo, gerarId: () => "b" }));
    expect(await repo.gastoDoMesUsd("2026-11")).toBeCloseTo(
      primeira.gastoUsd + segunda.gastoUsd,
      6,
    );
    expect((await repo.ultimoBriefing())?.versao).toBe(2);
  });
});

describe("continuidade com o briefing de ontem", () => {
  it("passa os títulos de ontem ao redator, para o selo 'Continua de ontem'", async () => {
    const repo = novoRepo();
    const primeira = await executarPipeline(montar({ repo, gerarId: () => "ontem" }));
    // Reescreve o registro como se fosse de ontem.
    const registro = await repo.ultimoBriefing();
    expect(registro).not.toBeNull();
    if (!registro || !primeira.briefing) throw new Error("briefing não gerado");
    const ontem = {
      ...registro,
      data: "2026-11-04",
      briefing: { ...primeira.briefing, data: "2026-11-04" },
    };
    const repoDeOntem = novoRepo();
    await repoDeOntem.gravarBriefing(ontem);

    const modelo = modeloDoMundo();
    await executarPipeline(
      montar({ repo: repoDeOntem, clienteBase: modelo, gerarId: () => "hoje" }),
    );
    const redacao = modelo.chamadas.find((c) => c.passo === "redacao");
    expect(redacao?.usuario).toContain("Briefing de 2026-11-04");
    expect(redacao?.usuario).toContain("Obra 1 começa no bairro Alfa");
  });

  it("sem briefing anterior, o material diz isso", async () => {
    const modelo = modeloDoMundo();
    await executarPipeline(montar({ clienteBase: modelo }));
    expect(modelo.chamadas.find((c) => c.passo === "redacao")?.usuario).toContain(
      "não há briefing anterior",
    );
  });
});

describe("RespostaInvalida", () => {
  it("é um erro tratável, com o nome do passo", () => {
    expect(new RespostaInvalida("redacao", "x").message).toContain('"redacao"');
  });
});
