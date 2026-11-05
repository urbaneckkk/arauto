import type { TemaId } from "@arauto/core";
import { describe, expect, it } from "vitest";
import {
  aprovado,
  CASOS_DE_TEMA,
  type CasoDeTema,
  rodarTodosOsCasos,
} from "../src/cli/casos-de-tema.js";
import type { ChamadaDeModelo, ClienteDeModelo } from "../src/modelos/cliente.js";
import { respostaDeTexto } from "../src/modelos/falso.js";
import { HAIKU } from "./mundo.js";

const sinais = (extras: object = {}) => ({
  perdaDeVidas: false,
  vitimasConfirmadas: null,
  atentadoOuMassacre: false,
  escaladaMilitar: false,
  armaOuInstalacaoNuclear: false,
  animalEmSofrimento: false,
  ...extras,
});

const proposta = (id: TemaId, s: object = {}) =>
  respostaDeTexto(
    HAIKU,
    JSON.stringify({
      id,
      intensidade: 2,
      confianca: 0.95,
      motivo: "Motivo de teste.",
      notificacao: { titulo: "Aviso de teste", corpo: "Corpo do aviso de teste." },
      sinais: sinais(s),
    }),
  );

function casoDaChamada(chamada: ChamadaDeModelo): CasoDeTema {
  const caso = CASOS_DE_TEMA.find((c) => chamada.usuario.includes(c.titulo));
  if (!caso) throw new Error("chamada de um caso desconhecido");
  return caso;
}

/** Modelo que acerta tudo, com a ficha de sinais certa. */
const modeloPerfeito: ClienteDeModelo = {
  async chamar(chamada) {
    const caso = casoDaChamada(chamada);
    const sinaisDoCaso: Record<string, object> = {
      "escalada-militar": { escaladaMilitar: true },
      "missil-nuclear": { escaladaMilitar: true, armaOuInstalacaoNuclear: true },
      "queda-de-aviao": { perdaDeVidas: true, vitimasConfirmadas: 45 },
      "bombardeio-com-civis": {
        escaladaMilitar: true,
        perdaDeVidas: true,
        vitimasConfirmadas: null,
      },
      "animal-ferido": { animalEmSofrimento: true },
      "usina-com-mortos": {
        perdaDeVidas: true,
        vitimasConfirmadas: 12,
        armaOuInstalacaoNuclear: true,
      },
      "guerra-sem-mortes": { escaladaMilitar: true },
    };
    const id: TemaId = caso.esperado.length === 1 ? (caso.esperado[0] as TemaId) : "neutro";
    return proposta(id, sinaisDoCaso[caso.id] ?? {});
  },
};

/** Modelo HOSTIL: sempre responde ternura_animal e jura que não há nada grave (ficha toda falsa). */
const modeloHostil: ClienteDeModelo = {
  async chamar() {
    return proposta("ternura_animal");
  },
};

/** Modelo quebrado: sempre falha. O pipeline cai no tema de emergência. */
const modeloQuebrado: ClienteDeModelo = {
  async chamar() {
    throw new Error("API fora do ar");
  },
};

describe("casos fictícios de tema (aceite da Etapa 1)", () => {
  it("cobre os 8 casos do briefing e os marca com o que é crítico", () => {
    const ids = CASOS_DE_TEMA.map((c) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "resgate-de-filhote",
        "escalada-militar",
        "missil-nuclear",
        "queda-de-aviao",
        "bombardeio-com-civis",
        "animal-ferido",
        "bolsas-despencam",
        "sonda-em-marte",
      ]),
    );
    const criticos = CASOS_DE_TEMA.filter((c) => c.critico).map((c) => c.id);
    expect(criticos).toEqual(
      expect.arrayContaining([
        "missil-nuclear",
        "queda-de-aviao",
        "bombardeio-com-civis",
        "animal-ferido",
      ]),
    );
  });

  it("um modelo que acerta a ficha passa em 100% dos casos", async () => {
    const resultados = await rodarTodosOsCasos(modeloPerfeito, HAIKU, 3);
    for (const r of resultados) expect(r.acertos, r.caso.id).toBe(r.repeticoes);
    expect(aprovado(resultados)).toBe(true);
  });

  it("MESMO com um modelo hostil, os casos críticos ficam em 100% (as regras de código seguram)", async () => {
    const resultados = await rodarTodosOsCasos(modeloHostil, HAIKU, 3);
    const porId = Object.fromEntries(resultados.map((r) => [r.caso.id, r]));
    for (const r of resultados.filter((x) => x.caso.critico)) {
      expect(r.acertos, `crítico ${r.caso.id}`).toBe(r.repeticoes);
    }
    expect(aprovado(resultados)).toBe(true);
    // O que não é crítico o modelo hostil erra, e isso é esperado: só a segurança é garantida por código.
    expect(porId["escalada-militar"]?.acertos).toBe(0);
    expect(porId["bolsas-despencam"]?.acertos).toBe(0);
  });

  it("com o modelo fora do ar, o plano de emergência ainda acerta luto, nuclear e animal ferido", async () => {
    const resultados = await rodarTodosOsCasos(modeloQuebrado, HAIKU, 2);
    expect(aprovado(resultados)).toBe(true);
    for (const r of resultados) expect(r.falhasDoModelo).toBe(r.repeticoes);
  });

  it("um modelo que erra de verdade um caso crítico reprova o conjunto", async () => {
    const quebradoNoLuto: ClienteDeModelo = {
      async chamar(chamada) {
        const caso = casoDaChamada(chamada);
        // Responde certo, menos no luto, e ainda esconde o sinal. Precisa das manchetes para o veto
        // salvar: aqui o caso é alterado para NÃO ter palavras de morte, simulando o buraco.
        return caso.id === "queda-de-aviao" ? proposta("esporte") : modeloPerfeito.chamar(chamada);
      },
    };
    const semPalavrasDeMorte: CasoDeTema[] = CASOS_DE_TEMA.map((c) =>
      c.id === "queda-de-aviao"
        ? { ...c, manchetes: ["Avião de passageiros cai no litoral"], titulo: c.titulo }
        : c,
    );
    const resultados = await rodarTodosOsCasos(quebradoNoLuto, HAIKU, 2, semPalavrasDeMorte);
    expect(aprovado(resultados)).toBe(false);
  });
});
