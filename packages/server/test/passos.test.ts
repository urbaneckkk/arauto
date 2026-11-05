import { describe, expect, it } from "vitest";
import { coletar } from "../src/coleta/coletar.js";
import type { Perfil } from "../src/config/env.js";
import { PERFIS } from "../src/config/env.js";
import { FEEDS } from "../src/config/feeds.js";
import { logSilencioso } from "../src/infra/log.js";
import { RespostaInvalida } from "../src/modelos/cliente.js";
import { ClienteFalso, respostaDeTexto } from "../src/modelos/falso.js";
import { executarApuracao, temasFracos, trocarUrlsPorIds } from "../src/passos/apuracao.js";
import { medirLeitura } from "../src/passos/leitura.js";
import { montarMaterial } from "../src/passos/material.js";
import {
  pontuarComGdelt,
  pontuarSemGdelt,
  REFERENCIA_VEICULOS_RSS,
  recencia,
} from "../src/passos/pontuacao.js";
import { executarTema, temaDeEmergencia } from "../src/passos/tema.js";
import {
  CANDIDATOS_GDELT,
  executarTermometro,
  FALHAS_SEGUIDAS_PARA_DESISTIR,
} from "../src/passos/termometro.js";
import { semPausa } from "../src/passos/tipos.js";
import { ok } from "./ajudantes.js";
import { briefingExemplo } from "./briefing-exemplo.js";
import {
  AGORA,
  agrupamentoFalso,
  apuracaoFalsa,
  HAIKU,
  relogio,
  SONNET,
  temaFalso,
  transporteDoMundo,
  urlGdeltDoEvento,
} from "./mundo.js";

async function coletaDoMundo(opcoes?: Parameters<typeof transporteDoMundo>[0]) {
  const transporte = transporteDoMundo(opcoes);
  const coleta = await coletar({
    transporte,
    relogio,
    log: logSilencioso,
    feeds: FEEDS.filter((f) => f.id === "agbr-ultimas" || f.id === "g1-home"),
  });
  return { transporte, coleta };
}

const gdeltOk = (artigos: number) =>
  ok(
    JSON.stringify({
      articles: Array.from({ length: artigos }, (_, i) => ({
        domain: `site${i}.com`,
        sourcecountry: `Pais${i % 12}`,
      })),
    }),
    "application/json",
  );

describe("pontuação (feita por código)", () => {
  it("recência: 1 = agora, 0 = 36 horas ou mais", () => {
    const agora = new Date("2026-11-05T09:00:00Z");
    expect(recencia([agora.toISOString()], agora)).toBe(1);
    expect(recencia(["2026-11-03T09:00:00Z"], agora)).toBe(0);
    expect(recencia(["2026-11-04T15:00:00Z"], agora)).toBeCloseTo(0.5, 2);
    expect(recencia([], agora)).toBe(0);
  });

  it("mais veículos e mais recente pontuam mais (sem GDELT)", () => {
    expect(pontuarSemGdelt({ veiculos: 6, recencia: 0.5 })).toBeGreaterThan(
      pontuarSemGdelt({ veiculos: 2, recencia: 0.5 }),
    );
    expect(pontuarSemGdelt({ veiculos: 4, recencia: 0.9 })).toBeGreaterThan(
      pontuarSemGdelt({ veiculos: 4, recencia: 0.1 }),
    );
  });

  it("fica sempre entre 0 e 1, mesmo com números enormes", () => {
    const grande = pontuarComGdelt({ veiculos: 1e6, paises: 1e6, recencia: 1, artigos: 1e9 });
    expect(grande).toBeLessThanOrEqual(1);
    expect(pontuarSemGdelt({ veiculos: REFERENCIA_VEICULOS_RSS * 10, recencia: 1 })).toBe(1);
    expect(pontuarComGdelt({ veiculos: 0, paises: 0, recencia: 0, artigos: 0 })).toBe(0);
  });

  it("com GDELT, volume e países pesam", () => {
    const base = { veiculos: 10, paises: 3, recencia: 0.5 };
    expect(pontuarComGdelt({ ...base, artigos: 200 })).toBeGreaterThan(
      pontuarComGdelt({ ...base, artigos: 5 }),
    );
    expect(pontuarComGdelt({ ...base, artigos: 50, paises: 12 })).toBeGreaterThan(
      pontuarComGdelt({ ...base, artigos: 50, paises: 1 }),
    );
  });
});

describe("termômetro (passo 2)", () => {
  async function rodar(
    mapa: Parameters<typeof transporteDoMundo>[0] = {},
    modelo = new ClienteFalso({ termometro: agrupamentoFalso }),
  ) {
    const { transporte, coleta } = await coletaDoMundo(mapa);
    const resultado = await executarTermometro(
      { cliente: modelo, transporte, relogio, log: logSilencioso, modelo: HAIKU, pausa: semPausa },
      coleta.itens,
    );
    return { resultado, transporte, modelo };
  }

  it("agrupa os itens por acontecimento e conta veículos distintos", async () => {
    const { resultado } = await rodar();
    expect(resultado.clusters).toHaveLength(20);
    expect(resultado.clusters.every((c) => c.veiculos === 2)).toBe(true);
    expect(resultado.clusters.every((c) => c.itens.length === 2)).toBe(true);
  });

  it("sem GDELT, a história do dia sai do RSS e a pontuação é parcial", async () => {
    const { resultado } = await rodar();
    expect(resultado.parcial).toBe(true);
    expect(resultado.historiaDoDia.pontuacaoParcial).toBe(true);
    // O evento 1 é o mais recente dos dois feeds.
    expect(resultado.historiaDoDia.titulo).toContain("Evento 1");
  });

  it("desiste do GDELT depois de duas falhas seguidas (disjuntor)", async () => {
    const { transporte } = await rodar();
    const consultas = transporte.chamadas.filter((c) => c.includes("api.gdeltproject.org"));
    expect(consultas.length).toBe(FALHAS_SEGUIDAS_PARA_DESISTIR);
  });

  it("com o GDELT respondendo para todos os candidatos, a pontuação não é parcial e o volume decide", async () => {
    // O evento 3 recebe muito mais cobertura mundial que os outros.
    const mapa: Record<string, ReturnType<typeof gdeltOk>> = {};
    for (let n = 1; n <= 20; n++) mapa[urlGdeltDoEvento(n)] = gdeltOk(n === 3 ? 240 : 4);
    const { resultado } = await rodar({ mapa });
    expect(resultado.parcial).toBe(false);
    expect(resultado.gdeltConsultas).toBe(CANDIDATOS_GDELT);
    expect(resultado.historiaDoDia.titulo).toContain("Evento 3");
    expect(resultado.historiaDoDia.pontuacaoParcial).toBe(false);
  });

  it("se UM candidato falha, todos ficam sem GDELT (comparar métodos diferentes seria injusto)", async () => {
    const mapa: Record<string, ReturnType<typeof gdeltOk>> = {};
    for (let n = 1; n <= 20; n++) mapa[urlGdeltDoEvento(n)] = gdeltOk(n === 3 ? 240 : 4);
    // Os candidatos são os 5 mais pontuados; derruba um deles.
    mapa[urlGdeltDoEvento(2)] = { status: 429, contentType: null, corpo: "Please limit requests" };
    const { resultado } = await rodar({ mapa });
    expect(resultado.parcial).toBe(true);
    expect(resultado.historiaDoDia.titulo).toContain("Evento 1");
  });

  it("ignora ids que o modelo inventou e não deixa um item em dois grupos", async () => {
    const modelo = new ClienteFalso({
      termometro: (chamada) => {
        const ids = chamada.usuario.split("\n").map((l) => l.split(" | ")[0] ?? "");
        return respostaDeTexto(
          HAIKU,
          JSON.stringify({
            acontecimentos: [
              {
                titulo: "Grupo A",
                categoria: "politica",
                itens: [ids[0], "i999", ids[1]],
                consultaGdelt: "a",
              },
              {
                titulo: "Grupo B",
                categoria: "economia",
                itens: [ids[1], ids[2]],
                consultaGdelt: "b",
              },
              { titulo: "Grupo vazio", categoria: "mundo", itens: ["i998"], consultaGdelt: "c" },
            ],
          }),
        );
      },
    });
    const { resultado } = await rodar({}, modelo);
    const grupoA = resultado.clusters.find((c) => c.titulo === "Grupo A");
    const grupoB = resultado.clusters.find((c) => c.titulo === "Grupo B");
    expect(grupoA?.itens).toHaveLength(2);
    expect(grupoB?.itens).toHaveLength(1);
    expect(resultado.clusters.find((c) => c.titulo === "Grupo vazio")).toBeUndefined();
  });

  it("acontecimento descartado nunca vira história do dia", async () => {
    const modelo = new ClienteFalso({
      termometro: (chamada) => {
        const ids = chamada.usuario.split("\n").map((l) => l.split(" | ")[0] ?? "");
        return respostaDeTexto(
          HAIKU,
          JSON.stringify({
            acontecimentos: [
              {
                titulo: "Fofoca de celebridade",
                categoria: "descartar",
                itens: ids.slice(0, 20),
                consultaGdelt: "x",
              },
              {
                titulo: "Notícia séria",
                categoria: "politica",
                itens: [ids[39]],
                consultaGdelt: "y",
              },
            ],
          }),
        );
      },
    });
    const { resultado } = await rodar({}, modelo);
    expect(resultado.historiaDoDia.titulo).toBe("Notícia séria");
  });

  it("sem nenhum acontecimento relevante, é erro", async () => {
    const modelo = new ClienteFalso({
      termometro: respostaDeTexto(HAIKU, JSON.stringify({ acontecimentos: [] })),
    });
    await expect(rodar({}, modelo)).rejects.toThrow(/nenhum acontecimento relevante/);
  });

  it("resposta que não é o JSON esperado vira RespostaInvalida", async () => {
    const modelo = new ClienteFalso({ termometro: respostaDeTexto(HAIKU, "não sou json") });
    await expect(rodar({}, modelo)).rejects.toThrow(RespostaInvalida);
  });
});

describe("apuração (passo 3)", () => {
  const perfil: Perfil = PERFIS.padrao;

  it("troca URLs por identificadores e marca as que não vieram da busca", () => {
    const mapa = new Map([["https://g1.globo.com/a/b", "w01"]]);
    const texto =
      "Fato um (fonte: https://g1.globo.com/a/b?utm_source=x). Fato dois (fonte: https://site-inventado.com/xyz).";
    expect(trocarUrlsPorIds(texto, mapa)).toBe(
      "Fato um (fonte: [w01]). Fato dois (fonte: [sem fonte verificada]).",
    );
  });

  it("registra só achados de domínios permitidos, sem repetir, e lê a data da página", async () => {
    const modelo = new ClienteFalso({
      apuracao: respostaDeTexto(SONNET, "- [politica] Fato. (fonte: https://www.bbc.com/a)", {
        buscas: 3,
        resultadosDeBusca: [
          { url: "https://www.bbc.com/a", titulo: "BBC A", idade: "2 hours ago" },
          { url: "https://www.bbc.com/a#topo", titulo: "BBC A de novo", idade: null },
          { url: "https://blog-qualquer.com/x", titulo: "Blog", idade: "1 hour ago" },
          { url: "https://g1.globo.com/b", titulo: "g1 B", idade: "April 30, 2020" },
          { url: "https://valor.globo.com/c", titulo: "Valor C", idade: "quando der" },
        ],
      }),
    });
    const { coleta } = await coletaDoMundo();
    const { transporte } = await coletaDoMundo();
    const termometro = await executarTermometro(
      {
        cliente: new ClienteFalso({ termometro: agrupamentoFalso }),
        transporte,
        relogio,
        log: logSilencioso,
        modelo: HAIKU,
        pausa: semPausa,
      },
      coleta.itens,
    );
    const apuracao = await executarApuracao(
      { cliente: modelo, relogio, log: logSilencioso, modelo: SONNET, perfil },
      termometro,
      [],
    );
    expect(apuracao.itens.map((i) => i.url)).toEqual([
      "https://www.bbc.com/a",
      "https://g1.globo.com/b",
      "https://valor.globo.com/c",
    ]);
    expect(apuracao.itens[0]?.publicadoEm).toBe(
      new Date(AGORA.getTime() - 2 * 3_600_000).toISOString(),
    );
    expect(apuracao.itens[2]?.publicadoEm).toBeNull(); // sem data confiável
    expect(apuracao.texto).toContain("[w01]");
    expect(apuracao.buscas).toBe(3);
  });

  it("manda para o modelo o limite de buscas do perfil e só os domínios da lista branca", async () => {
    const modelo = new ClienteFalso({ apuracao: apuracaoFalsa });
    const { coleta, transporte } = await coletaDoMundo();
    const termometro = await executarTermometro(
      {
        cliente: new ClienteFalso({ termometro: agrupamentoFalso }),
        transporte,
        relogio,
        log: logSilencioso,
        modelo: HAIKU,
        pausa: semPausa,
      },
      coleta.itens,
    );
    await executarApuracao(
      { cliente: modelo, relogio, log: logSilencioso, modelo: SONNET, perfil: PERFIS.economico },
      termometro,
      [],
    );
    const chamada = modelo.chamadas[0];
    expect(chamada?.busca?.maxBuscas).toBe(3);
    expect(chamada?.busca?.dominios).toContain("simepar.br");
    expect(chamada?.busca?.dominios).toContain("defesacivil.pr.gov.br");
    // O rastreador da Anthropic não acessa estes (a busca inteira dá 400): ficam fora da lista da busca.
    for (const bloqueado of [
      "reuters.com",
      "apnews.com",
      "bbc.com",
      "bbc.co.uk",
      "estadao.com.br",
    ]) {
      expect(chamada?.busca?.dominios, bloqueado).not.toContain(bloqueado);
    }
    expect(chamada?.esforco).toBe("low");
  });

  it("temasFracos aponta seções com menos de 2 acontecimentos", async () => {
    const { coleta, transporte } = await coletaDoMundo();
    const termometro = await executarTermometro(
      {
        cliente: new ClienteFalso({ termometro: agrupamentoFalso }),
        transporte,
        relogio,
        log: logSilencioso,
        modelo: HAIKU,
        pausa: semPausa,
      },
      coleta.itens,
    );
    // O mundo de teste só tem politica, economia, mundo e 1 curiosidade.
    expect(temasFracos(termometro)).toEqual(["agro", "tecnologia", "seguranca_saude", "parana"]);
  });
});

describe("material do redator", () => {
  it("traz a história do dia, o tempo oficial, os alertas e os itens por identificador, sem URLs", async () => {
    const { coleta, transporte } = await coletaDoMundo();
    const termometro = await executarTermometro(
      {
        cliente: new ClienteFalso({ termometro: agrupamentoFalso }),
        transporte,
        relogio,
        log: logSilencioso,
        modelo: HAIKU,
        pausa: semPausa,
      },
      coleta.itens,
    );
    const material = montarMaterial({
      agora: AGORA,
      termometro,
      coleta,
      apuracao: null,
      ontem: null,
      perfil: PERFIS.padrao,
    });
    expect(material).toContain("quinta-feira, 5 de novembro de 2026");
    expect(material).toContain("Mínima 17.8 °C, máxima 26.1 °C, chance de chuva 85%");
    expect(material).toContain("LARANJA · Tempestade");
    expect(material).toMatch(/\[i\d{3}\] /);
    expect(material).toContain("A apuração por busca não está disponível hoje");
    expect(material).not.toMatch(/https?:\/\//);
  });

  it("sem previsão, manda dizer isso em vez de inventar números", async () => {
    const { coleta, transporte } = await coletaDoMundo();
    const termometro = await executarTermometro(
      {
        cliente: new ClienteFalso({ termometro: agrupamentoFalso }),
        transporte,
        relogio,
        log: logSilencioso,
        modelo: HAIKU,
        pausa: semPausa,
      },
      coleta.itens,
    );
    const material = montarMaterial({
      agora: AGORA,
      termometro,
      coleta: { ...coleta, tempo: null, alertas: [] },
      apuracao: null,
      ontem: null,
      perfil: PERFIS.padrao,
    });
    expect(material).toContain("A previsão do tempo está indisponível hoje");
    expect(material).toContain("Sem alertas do INMET para Curitiba");
  });

  it("limita os acontecimentos por seção ao perfil", async () => {
    const { coleta, transporte } = await coletaDoMundo();
    const termometro = await executarTermometro(
      {
        cliente: new ClienteFalso({ termometro: agrupamentoFalso }),
        transporte,
        relogio,
        log: logSilencioso,
        modelo: HAIKU,
        pausa: semPausa,
      },
      coleta.itens,
    );
    const contar = (perfil: Perfil) =>
      montarMaterial({
        agora: AGORA,
        termometro,
        coleta,
        apuracao: null,
        ontem: null,
        perfil,
      }).split("Acontecimento (").length - 1;
    expect(contar(PERFIS.economico)).toBeLessThan(contar(PERFIS.padrao));
  });
});

describe("tema (passo 6)", () => {
  const historia = {
    titulo: "Obras na cidade",
    resumo: "Resumo.",
    manchetes: ["Prefeitura anuncia obra no bairro Alfa"],
  };

  it("aplica as regras de segurança em cima da proposta do modelo", async () => {
    const proposta = JSON.parse(temaFalso("ternura_animal").texto);
    proposta.sinais.animalEmSofrimento = true;
    const modelo = new ClienteFalso({ tema: respostaDeTexto(HAIKU, JSON.stringify(proposta)) });
    const decisao = await executarTema({ cliente: modelo, modelo: HAIKU }, historia);
    expect(decisao.tema.id).toBe("neutro");
    expect(decisao.regras).toContain("animal_em_sofrimento");
  });

  it("tema de emergência é neutro, mas tragédia nas manchetes ainda vira luto", () => {
    expect(temaDeEmergencia(historia).tema.id).toBe("neutro");
    const tragedia = temaDeEmergencia({
      ...historia,
      manchetes: ["Queda de avião deixa 45 mortos"],
    });
    expect(tragedia.tema.id).toBe("luto");
  });

  it("id fora do catálogo na resposta do modelo é recusado pelo formato", async () => {
    const proposta = JSON.parse(temaFalso().texto);
    proposta.id = "tema_inventado";
    const modelo = new ClienteFalso({ tema: respostaDeTexto(HAIKU, JSON.stringify(proposta)) });
    await expect(executarTema({ cliente: modelo, modelo: HAIKU }, historia)).rejects.toThrow(
      RespostaInvalida,
    );
  });
});

describe("leitura", () => {
  it("conta só o texto lido e estima os minutos a 220 palavras por minuto", () => {
    const leitura = medirLeitura(briefingExemplo());
    expect(leitura.palavras).toBeGreaterThan(50);
    expect(leitura.minutos).toBeCloseTo(leitura.palavras / 220, 1);
  });
});
