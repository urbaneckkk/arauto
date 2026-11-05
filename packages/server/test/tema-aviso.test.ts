import { describe, expect, it } from "vitest";
import { ClienteFalso, respostaDeTexto } from "../src/modelos/falso.js";
import { executarTema } from "../src/passos/tema.js";
import { HAIKU, temaFalso } from "./mundo.js";

const historia = {
  titulo: "Prefeitura anuncia obras em três avenidas de Curitiba",
  resumo: "A prefeitura anunciou obras em três avenidas.",
  manchetes: ["Prefeitura anuncia obras em três avenidas de Curitiba"],
};

function comAviso(titulo: string, corpo: string, extras: object = {}) {
  const base = JSON.parse(temaFalso("politica").texto);
  return respostaDeTexto(
    HAIKU,
    JSON.stringify({ ...base, ...extras, notificacao: { titulo, corpo } }),
  );
}

describe("aviso do tema comprido demais", () => {
  it("mantém a decisão do modelo e troca só o texto do aviso", async () => {
    const modelo = new ClienteFalso({
      tema: comAviso(
        "t".repeat(60),
        "Prefeitura anuncia obras em três avenidas a partir de segunda-feira",
      ),
    });
    const resultado = await executarTema({ cliente: modelo, modelo: HAIKU }, historia);
    expect(resultado.avisoSubstituido).toBe(true);
    expect(resultado.tema.id).toBe("politica");
    expect(resultado.tema.notificacao.titulo).toBe("Briefing de hoje");
    expect(resultado.tema.notificacao.corpo).toBe(historia.titulo);
  });

  it("corpo comprido (mais de 110) também é trocado", async () => {
    const modelo = new ClienteFalso({ tema: comAviso("Obras em Curitiba", "c".repeat(150)) });
    const resultado = await executarTema({ cliente: modelo, modelo: HAIKU }, historia);
    expect(resultado.avisoSubstituido).toBe(true);
    expect(resultado.tema.id).toBe("politica");
  });

  it("aviso dentro do limite é mantido, sem troca", async () => {
    const modelo = new ClienteFalso({
      tema: comAviso("Obras em Curitiba", "Três avenidas terão obras."),
    });
    const resultado = await executarTema({ cliente: modelo, modelo: HAIKU }, historia);
    expect(resultado.avisoSubstituido).toBe(false);
    expect(resultado.tema.notificacao).toEqual({
      titulo: "Obras em Curitiba",
      corpo: "Três avenidas terão obras.",
    });
  });

  it("aviso comprido NÃO esconde uma tragédia: a ficha de sinais continua mandando", async () => {
    const modelo = new ClienteFalso({
      tema: comAviso("t".repeat(80), "c".repeat(200), {
        sinais: {
          perdaDeVidas: true,
          vitimasConfirmadas: 30,
          atentadoOuMassacre: false,
          escaladaMilitar: false,
          armaOuInstalacaoNuclear: false,
          animalEmSofrimento: false,
        },
      }),
    });
    const resultado = await executarTema({ cliente: modelo, modelo: HAIKU }, historia);
    expect(resultado.tema.id).toBe("luto");
    expect(resultado.avisoSubstituido).toBe(true);
  });
});
