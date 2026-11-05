import { describe, expect, it } from "vitest";
import {
  animalEmSofrimentoNasManchetes,
  aplicarRegrasDeTema,
  armaNuclearNasManchetes,
  LIMITE_VITIMAS_LUTO,
  type PropostaDeTema,
  perdaDeVidasNasManchetes,
  TEMA_IDS,
  TemaEscolhidoSchema,
} from "../src/index.js";
import { sinaisNeutros } from "./fixtures.js";

/** Proposta do modelo, com padrões neutros e a possibilidade de sobrescrever campos. */
function proposta(id: string, sinais: Partial<PropostaDeTema["sinais"]> = {}, confianca = 0.92) {
  return {
    id,
    intensidade: 2,
    confianca,
    motivo: "Motivo do modelo.",
    notificacao: { titulo: "Título do modelo", corpo: "Corpo do modelo." },
    sinais: { ...sinaisNeutros(), ...sinais },
  } satisfies PropostaDeTema;
}

describe("os 8 casos fictícios do briefing (Etapa 1)", () => {
  it("resgate de filhote vira ternura_animal", () => {
    const { tema, regras } = aplicarRegrasDeTema(proposta("ternura_animal"));
    expect(tema.id).toBe("ternura_animal");
    expect(regras).toEqual([]);
  });

  it("escalada militar vira conflito", () => {
    const { tema } = aplicarRegrasDeTema(proposta("conflito", { escaladaMilitar: true }));
    expect(tema.id).toBe("conflito");
  });

  it("teste de míssil nuclear vira nuclear", () => {
    const { tema } = aplicarRegrasDeTema(
      proposta("nuclear", { escaladaMilitar: true, armaOuInstalacaoNuclear: true }),
    );
    expect(tema.id).toBe("nuclear");
  });

  it("queda de avião com vítimas vira luto", () => {
    const { tema } = aplicarRegrasDeTema(
      proposta("luto", { perdaDeVidas: true, vitimasConfirmadas: 45 }),
    );
    expect(tema.id).toBe("luto");
  });

  it("bombardeio com centenas de civis mortos vira luto, mesmo em guerra", () => {
    const { tema, regras } = aplicarRegrasDeTema(
      proposta("conflito", { escaladaMilitar: true, perdaDeVidas: true, vitimasConfirmadas: 300 }),
    );
    expect(tema.id).toBe("luto");
    expect(regras).toContain("luto_por_sinais");
  });

  it("animal ferido não vira ternura_animal", () => {
    const { tema, regras } = aplicarRegrasDeTema(
      proposta("ternura_animal", { animalEmSofrimento: true }),
    );
    expect(tema.id).not.toBe("ternura_animal");
    expect(regras).toContain("animal_em_sofrimento");
  });

  it("bolsas despencando vira mercado_queda", () => {
    const { tema } = aplicarRegrasDeTema(proposta("mercado_queda"));
    expect(tema.id).toBe("mercado_queda");
  });

  it("sonda pousando em Marte vira ciencia_espaco", () => {
    const { tema } = aplicarRegrasDeTema(proposta("ciencia_espaco"));
    expect(tema.id).toBe("ciencia_espaco");
  });
});

describe("o modelo erra, e o código corrige", () => {
  it("tragédia classificada como esporte pelo modelo: a ficha de sinais manda", () => {
    const { tema } = aplicarRegrasDeTema(
      proposta("esporte", { perdaDeVidas: true, vitimasConfirmadas: 12 }),
    );
    expect(tema.id).toBe("luto");
  });

  it("tragédia com ficha errada (tudo falso): o veto pelas manchetes manda", () => {
    const { tema, regras } = aplicarRegrasDeTema(proposta("mercado_queda"), {
      manchetes: ["Queda de avião deixa 45 mortos no litoral"],
    });
    expect(tema.id).toBe("luto");
    expect(regras).toEqual(["luto_por_manchetes"]);
  });

  it("míssil nuclear classificado como conflito: a ficha de sinais manda", () => {
    const { tema } = aplicarRegrasDeTema(
      proposta("conflito", { escaladaMilitar: true, armaOuInstalacaoNuclear: true }),
    );
    expect(tema.id).toBe("nuclear");
  });

  it("nuclear sem sinal nuclear concreto não é nuclear", () => {
    const { tema, regras } = aplicarRegrasDeTema(proposta("nuclear"));
    expect(tema.id).toBe("neutro");
    expect(regras).toContain("nuclear_sem_sinal");
  });

  it("id inventado pelo modelo cai em neutro, sem erro", () => {
    const { tema, regras } = aplicarRegrasDeTema(proposta("tema_que_nao_existe"));
    expect(tema.id).toBe("neutro");
    expect(regras).toEqual(["id_fora_do_catalogo"]);
  });

  it("confiança abaixo de 0,7 cai em neutro", () => {
    expect(aplicarRegrasDeTema(proposta("esporte", {}, 0.69)).tema.id).toBe("neutro");
    expect(aplicarRegrasDeTema(proposta("esporte", {}, 0.7)).tema.id).toBe("esporte");
  });

  it("luto proposto pelo modelo é mantido", () => {
    expect(aplicarRegrasDeTema(proposta("luto")).tema.id).toBe("luto");
  });
});

describe("limites do luto", () => {
  it(`desastre com ${LIMITE_VITIMAS_LUTO - 1} mortos não é luto; com ${LIMITE_VITIMAS_LUTO}, é`, () => {
    const poucos = aplicarRegrasDeTema(
      proposta("clima_extremo", {
        perdaDeVidas: true,
        vitimasConfirmadas: LIMITE_VITIMAS_LUTO - 1,
      }),
    );
    const muitos = aplicarRegrasDeTema(
      proposta("clima_extremo", { perdaDeVidas: true, vitimasConfirmadas: LIMITE_VITIMAS_LUTO }),
    );
    expect(poucos.tema.id).toBe("clima_extremo");
    expect(muitos.tema.id).toBe("luto");
  });

  it("atentado ou massacre vira luto com qualquer número de mortos", () => {
    const { tema } = aplicarRegrasDeTema(
      proposta("conflito", { perdaDeVidas: true, vitimasConfirmadas: 2, atentadoOuMassacre: true }),
    );
    expect(tema.id).toBe("luto");
  });

  it("perda de vidas com número desconhecido é tratada como luto (lado seguro)", () => {
    const { tema } = aplicarRegrasDeTema(
      proposta("clima_extremo", { perdaDeVidas: true, vitimasConfirmadas: null }),
    );
    expect(tema.id).toBe("luto");
  });

  it("o limite é configurável", () => {
    const { tema } = aplicarRegrasDeTema(
      proposta("clima_extremo", { perdaDeVidas: true, vitimasConfirmadas: 3 }),
      { limiteVitimas: 3 },
    );
    expect(tema.id).toBe("luto");
  });
});

describe("aviso quando o tema é trocado por regra", () => {
  it("o texto alegre do modelo não acompanha um tema de luto", () => {
    const { tema } = aplicarRegrasDeTema(
      {
        ...proposta("ternura_animal", { perdaDeVidas: true, vitimasConfirmadas: 20 }),
        notificacao: { titulo: "Que fofura!", corpo: "Filhote adorável conquista a internet." },
      },
      { tituloDaHistoria: "Desastre deixa dezenas de vítimas no litoral" },
    );
    expect(tema.id).toBe("luto");
    expect(tema.notificacao.titulo).toBe("Briefing de hoje");
    expect(tema.notificacao.corpo).toBe("Desastre deixa dezenas de vítimas no litoral");
    expect(tema.motivo).toContain("regra de segurança");
  });

  it("título de história muito longo é cortado em 110 caracteres", () => {
    const { tema } = aplicarRegrasDeTema(
      proposta("esporte", { perdaDeVidas: true, vitimasConfirmadas: 9 }),
      { tituloDaHistoria: "x".repeat(300) },
    );
    expect(tema.notificacao.corpo.length).toBeLessThanOrEqual(110);
  });

  it("sem troca de tema, o texto do modelo é mantido", () => {
    const { tema } = aplicarRegrasDeTema(proposta("esporte"));
    expect(tema.notificacao).toEqual({ titulo: "Título do modelo", corpo: "Corpo do modelo." });
  });
});

describe("veto pelas manchetes", () => {
  it.each([
    "Bombardeio deixa centenas de civis mortos",
    "Queda de avião deixa 45 mortos",
    "Death toll rises to 32 after earthquake",
    "Mais de 1.200 mortes confirmadas após ciclone",
    "Dozens killed in attack on market",
    "Atentado deixa vítimas em shopping",
    "Chacina em bar deixa mortos",
    "Floods kill hundreds in the south",
  ])("acusa: %s", (manchete) => {
    expect(perdaDeVidasNasManchetes([manchete])).toBe(true);
  });

  it.each([
    "Ministro morre aos 80 anos",
    "Time vence o mata-mata e vai à final",
    "Acidente deixa 2 mortos em rodovia",
    "Número de mortes em 2026 cai 10% no trânsito",
    "Dólar fecha em queda e bolsa sobe",
    "Atentado frustrado é investigado pela polícia",
    "Filhote de capivara é adotado por bombeiros",
  ])("não acusa: %s", (manchete) => {
    expect(perdaDeVidasNasManchetes([manchete])).toBe(false);
  });

  it("uma manchete suspeita entre várias basta", () => {
    expect(perdaDeVidasNasManchetes(["Dólar sobe", "Ciclone deixa 30 mortos", "Bolsa cai"])).toBe(
      true,
    );
  });
});

describe("invariantes de segurança (todas as combinações)", () => {
  const booleanos = [false, true];
  const vitimas = [null, 2, 10] as const;

  it("vale para todo id do catálogo, mais um inventado, e todas as fichas de sinais", () => {
    const ids = [...TEMA_IDS, "id_inventado"];
    let casos = 0;
    for (const id of ids) {
      for (const perdaDeVidas of booleanos) {
        for (const atentadoOuMassacre of booleanos) {
          for (const escaladaMilitar of booleanos) {
            for (const armaOuInstalacaoNuclear of booleanos) {
              for (const animalEmSofrimento of booleanos) {
                for (const vitimasConfirmadas of vitimas) {
                  for (const confianca of [0.5, 0.9]) {
                    casos++;
                    const sinais = {
                      perdaDeVidas,
                      vitimasConfirmadas,
                      atentadoOuMassacre,
                      escaladaMilitar,
                      armaOuInstalacaoNuclear,
                      animalEmSofrimento,
                    };
                    const { tema } = aplicarRegrasDeTema(proposta(id, sinais, confianca));
                    const rotulo = JSON.stringify({ id, confianca, sinais, saida: tema.id });

                    const lutoObrigatorio =
                      perdaDeVidas &&
                      (atentadoOuMassacre ||
                        vitimasConfirmadas === null ||
                        vitimasConfirmadas >= LIMITE_VITIMAS_LUTO);

                    // I1: o id final sempre está no catálogo e o tema é válido.
                    expect(TemaEscolhidoSchema.safeParse(tema).success, rotulo).toBe(true);
                    // I2: animal em sofrimento nunca usa ternura_animal.
                    if (animalEmSofrimento) expect(tema.id, rotulo).not.toBe("ternura_animal");
                    // I3: perda de vidas relevante é sempre luto, mesmo em guerra.
                    if (lutoObrigatorio) expect(tema.id, rotulo).toBe("luto");
                    // I4: nuclear só com sinal nuclear concreto.
                    if (tema.id === "nuclear") expect(armaOuInstalacaoNuclear, rotulo).toBe(true);
                    // I5: sinal nuclear, sem luto, é nuclear.
                    if (!lutoObrigatorio && armaOuInstalacaoNuclear)
                      expect(tema.id, rotulo).toBe("nuclear");
                    // I6: escalada militar sem luto e sem nuclear é conflito.
                    if (!lutoObrigatorio && !armaOuInstalacaoNuclear && escaladaMilitar)
                      expect(tema.id, rotulo).toBe("conflito");
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(casos).toBe(ids.length * 2 * 2 * 2 * 2 * 2 * 3 * 2);
  });
});

describe("veto pelas manchetes: nuclear", () => {
  it.each([
    "País X testa míssil balístico com capacidade nuclear e eleva a tensão",
    "País X realiza teste nuclear subterrâneo",
    "Ameaça de ataque nuclear preocupa aliados",
    "Bomba atômica é ameaçada em discurso",
    "North Korea fires nuclear missile over the sea",
    "Drone ataca usina nuclear e deixa vazamento",
    "Explosão atinge usina nuclear no sul do país",
    "Shelling hits nuclear power plant, officials say",
    "Acidente em reator nuclear provoca evacuação",
  ])("acusa: %s", (manchete) => {
    expect(armaNuclearNasManchetes([manchete]), manchete).toBe(true);
  });

  it.each([
    "Governo retoma as obras de Angra 3, usina nuclear no Rio",
    "Acordo nuclear entre países avança em reunião em Viena",
    "Pesquisadores desenvolvem energia nuclear mais barata",
    "Brasil debate a política nuclear para a geração de energia",
    "Médicos usam medicina nuclear para tratar tumores",
    "Famílias nucleares são tema de nova pesquisa do IBGE",
  ])("não acusa: %s", (manchete) => {
    expect(armaNuclearNasManchetes([manchete]), manchete).toBe(false);
  });

  it("míssil nuclear nas manchetes vira nuclear, mesmo se o modelo errou o tema e a ficha", () => {
    const { tema, regras } = aplicarRegrasDeTema(proposta("esporte"), {
      manchetes: ["País X testa míssil balístico com capacidade nuclear"],
    });
    expect(tema.id).toBe("nuclear");
    expect(regras).toEqual(["nuclear_por_manchetes"]);
  });

  it("tragédia numa usina nuclear continua sendo luto (luto vence nuclear)", () => {
    const { tema } = aplicarRegrasDeTema(proposta("nuclear", { armaOuInstalacaoNuclear: true }), {
      manchetes: ["Explosão em usina nuclear deixa 12 mortos"],
    });
    expect(tema.id).toBe("luto");
  });
});

describe("veto pelas manchetes: animal em sofrimento", () => {
  it.each([
    "Cão é encontrado ferido e abandonado em estrada",
    "Gato maltratado é resgatado por vizinhos",
    "Filhote de capivara atropelado é levado a clínica",
    "Cavalo morto em estrada comove moradores",
    "Dog found injured on highway rescued by police",
    "Animais em situação de maus-tratos são resgatados",
  ])("acusa: %s", (manchete) => {
    expect(animalEmSofrimentoNasManchetes([manchete]), manchete).toBe(true);
  });

  it.each([
    "Bombeiros resgatam filhote de capivara preso em bueiro e o adotam",
    "Cão ensina truques e vira estrela nas redes sociais",
    "Gato é adotado por quartel de bombeiros",
    "Ferido em acidente, motorista é levado ao hospital",
    "Abandonado pelo pai, jovem vence concurso de ciência",
  ])("não acusa: %s", (manchete) => {
    expect(animalEmSofrimentoNasManchetes([manchete]), manchete).toBe(false);
  });

  it("modelo escolhe ternura_animal mas a manchete fala de animal ferido: vira neutro", () => {
    const { tema, regras } = aplicarRegrasDeTema(proposta("ternura_animal"), {
      manchetes: ["Cão é encontrado ferido e abandonado em estrada"],
    });
    expect(tema.id).not.toBe("ternura_animal");
    expect(regras).toEqual(["animal_em_sofrimento_por_manchetes"]);
  });

  it("história leve de animal sem sofrimento continua ternura_animal", () => {
    const { tema, regras } = aplicarRegrasDeTema(proposta("ternura_animal"), {
      manchetes: ["Bombeiros resgatam filhote de capivara preso em bueiro e o adotam"],
    });
    expect(tema.id).toBe("ternura_animal");
    expect(regras).toEqual([]);
  });
});
