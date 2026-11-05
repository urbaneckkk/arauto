import type { TemaId } from "@arauto/core";
import type { ClienteDeModelo } from "../modelos/cliente.js";
import { executarTema, temaDeEmergencia } from "../passos/tema.js";

/**
 * Casos FICTÍCIOS do critério de aceite da Etapa 1 (briefing): "resgate de filhote vira
 * ternura_animal; escalada militar vira conflito; teste de míssil nuclear vira nuclear; queda de
 * avião com vítimas vira luto; bombardeio com centenas de civis mortos vira luto; animal ferido
 * não vira ternura_animal; bolsas despencando vira mercado_queda; sonda pousando em Marte vira
 * ciencia_espaco". Os três últimos casos são adversariais, para testar as regras de segurança.
 */
export interface CasoDeTema {
  id: string;
  descricao: string;
  titulo: string;
  resumo: string;
  manchetes: string[];
  /** Temas aceitos como resposta certa. */
  esperado: readonly TemaId[];
  /** Caso de segurança: o aceite exige 100% de acerto. */
  critico: boolean;
}

const TODOS: readonly TemaId[] = [
  "neutro",
  "ternura_animal",
  "conflito",
  "nuclear",
  "clima_extremo",
  "mercado_alta",
  "mercado_queda",
  "ciencia_espaco",
  "tecnologia_ia",
  "agro_safra",
  "politica",
  "saude",
  "esporte",
  "cultura",
  "luto",
];
const exceto = (...fora: TemaId[]) => TODOS.filter((id) => !fora.includes(id));

export const CASOS_DE_TEMA: readonly CasoDeTema[] = [
  {
    id: "resgate-de-filhote",
    descricao: "resgate de filhote → ternura_animal",
    titulo: "Bombeiros resgatam filhote de capivara preso em bueiro e decidem adotá-lo",
    resumo:
      "Um filhote de capivara ficou preso em um bueiro, foi resgatado sem ferimentos e será cuidado pelo quartel.",
    manchetes: [
      "Bombeiros resgatam filhote de capivara preso em bueiro",
      "Quartel adota filhote de capivara resgatado e vira atração na cidade",
    ],
    esperado: ["ternura_animal"],
    critico: false,
  },
  {
    id: "escalada-militar",
    descricao: "escalada militar → conflito",
    titulo: "País A mobiliza tropas na fronteira com o País B e ameaça responder à incursão",
    resumo:
      "O comando militar do País A anunciou o deslocamento de tropas e diz que responderá a qualquer nova incursão.",
    manchetes: [
      "País A mobiliza tropas na fronteira com o País B",
      "Comando militar do País A anuncia exercícios e ameaça resposta",
    ],
    esperado: ["conflito"],
    critico: false,
  },
  {
    id: "missil-nuclear",
    descricao: "teste de míssil nuclear → nuclear",
    titulo: "País X testa míssil balístico com capacidade nuclear e eleva a tensão",
    resumo:
      "O País X lançou um míssil balístico capaz de carregar ogiva nuclear. Aliados condenaram o teste.",
    manchetes: [
      "País X testa míssil balístico com capacidade nuclear e eleva a tensão",
      "Aliados condenam teste de míssil nuclear do País X",
    ],
    esperado: ["nuclear"],
    critico: true,
  },
  {
    id: "queda-de-aviao",
    descricao: "queda de avião com vítimas → luto",
    titulo: "Avião de passageiros cai no litoral e deixa 45 mortos",
    resumo:
      "Uma aeronave com 52 pessoas caiu pouco depois da decolagem. Equipes de resgate buscam sobreviventes.",
    manchetes: [
      "Avião de passageiros cai no litoral e deixa 45 mortos",
      "Bombeiros procuram sobreviventes em destroços de avião no litoral",
    ],
    esperado: ["luto"],
    critico: true,
  },
  {
    id: "bombardeio-com-civis",
    descricao: "bombardeio com centenas de civis mortos → luto (mesmo em guerra)",
    titulo: "Bombardeio atinge cidade e deixa centenas de civis mortos",
    resumo:
      "Um bombardeio atingiu áreas residenciais de uma cidade em meio à guerra. Autoridades locais falam em centenas de civis mortos.",
    manchetes: [
      "Bombardeio atinge cidade e deixa centenas de civis mortos",
      "Exército do País A afirma ter atingido alvos militares",
    ],
    esperado: ["luto"],
    critico: true,
  },
  {
    id: "animal-ferido",
    descricao: "animal ferido → nunca ternura_animal",
    titulo: "Cão é encontrado ferido e abandonado em estrada; ONG pede ajuda para custear cirurgia",
    resumo:
      "Um cachorro foi achado com ferimentos graves à beira de uma rodovia. Uma ONG pede doações para a cirurgia.",
    manchetes: [
      "Cão é encontrado ferido e abandonado em estrada",
      "ONG pede ajuda para custear cirurgia de cachorro ferido",
    ],
    esperado: exceto("ternura_animal"),
    critico: true,
  },
  {
    id: "bolsas-despencam",
    descricao: "bolsas despencando → mercado_queda",
    titulo: "Bolsas despencam no mundo; Ibovespa cai 6% e dólar dispara",
    resumo:
      "Os principais mercados fecharam em forte queda, com o Ibovespa recuando 6% e o dólar em alta.",
    manchetes: [
      "Bolsas despencam no mundo e Ibovespa cai 6%",
      "Dólar dispara com aversão a risco nos mercados",
    ],
    esperado: ["mercado_queda"],
    critico: false,
  },
  {
    id: "sonda-em-marte",
    descricao: "sonda pousando em Marte → ciencia_espaco",
    titulo: "Sonda pousa em Marte e envia as primeiras imagens da superfície",
    resumo:
      "A sonda completou o pouso e transmitiu as primeiras fotos do solo marciano para a Terra.",
    manchetes: [
      "Sonda pousa em Marte e envia as primeiras imagens",
      "Agência espacial comemora pouso bem-sucedido em Marte",
    ],
    esperado: ["ciencia_espaco"],
    critico: false,
  },
  {
    id: "usina-com-mortos",
    descricao: "adversarial: tragédia em usina nuclear → luto (luto vence nuclear)",
    titulo: "Explosão em usina nuclear deixa 12 mortos",
    resumo:
      "Uma explosão atingiu uma usina nuclear e causou 12 mortes. As autoridades investigam as causas.",
    manchetes: [
      "Explosão em usina nuclear deixa 12 mortos",
      "Autoridades investigam explosão em usina nuclear",
    ],
    esperado: ["luto"],
    critico: true,
  },
  {
    id: "guerra-sem-mortes",
    descricao: "adversarial: ofensiva sem mortes noticiadas → conflito",
    titulo: "Exército anuncia ofensiva e eleva o risco de guerra regional",
    resumo:
      "O comando militar anunciou uma ofensiva na região de fronteira. Não há balanço de vítimas.",
    manchetes: ["Exército anuncia ofensiva e eleva o risco de guerra regional"],
    esperado: ["conflito"],
    critico: false,
  },
  {
    id: "acordo-nuclear",
    descricao: "adversarial: negociação de acordo nuclear → NÃO é nuclear",
    titulo: "Países retomam negociação de acordo nuclear em Viena",
    resumo:
      "Diplomatas voltaram à mesa em Viena para discutir regras do programa nuclear civil de um país.",
    manchetes: ["Países retomam negociação de acordo nuclear em Viena"],
    esperado: exceto("nuclear"),
    critico: true,
  },
];

export interface ResultadoDoCaso {
  caso: CasoDeTema;
  repeticoes: number;
  acertos: number;
  /** Quantas vezes o modelo falhou e o tema veio do plano de emergência. */
  falhasDoModelo: number;
  respostas: Record<string, number>;
}

/** Roda um caso `repeticoes` vezes, exatamente como o pipeline faz (modelo + regras; emergência se falhar). */
export async function rodarCaso(
  cliente: ClienteDeModelo,
  modelo: string,
  caso: CasoDeTema,
  repeticoes: number,
): Promise<ResultadoDoCaso> {
  const historia = { titulo: caso.titulo, resumo: caso.resumo, manchetes: caso.manchetes };
  const respostas: Record<string, number> = {};
  let acertos = 0;
  let falhasDoModelo = 0;
  for (let i = 0; i < repeticoes; i++) {
    let id: TemaId;
    try {
      id = (await executarTema({ cliente, modelo }, historia)).tema.id;
    } catch (erro) {
      // Custo esgotado para tudo; qualquer outra falha cai no plano de emergência, como no pipeline.
      if (erro instanceof Error && erro.name === "OrcamentoEsgotado") throw erro;
      falhasDoModelo++;
      id = temaDeEmergencia(historia).tema.id;
    }
    respostas[id] = (respostas[id] ?? 0) + 1;
    if (caso.esperado.includes(id)) acertos++;
  }
  return { caso, repeticoes, acertos, falhasDoModelo, respostas };
}

export async function rodarTodosOsCasos(
  cliente: ClienteDeModelo,
  modelo: string,
  repeticoes: number,
  casos: readonly CasoDeTema[] = CASOS_DE_TEMA,
): Promise<ResultadoDoCaso[]> {
  const resultados: ResultadoDoCaso[] = [];
  for (const caso of casos) resultados.push(await rodarCaso(cliente, modelo, caso, repeticoes));
  return resultados;
}

/** O aceite exige 100% nos casos críticos (luto, nuclear, animal ferido e afins). */
export function aprovado(resultados: readonly ResultadoDoCaso[]): boolean {
  return resultados.filter((r) => r.caso.critico).every((r) => r.acertos === r.repeticoes);
}
