import {
  CONFIANCA_MINIMA,
  type PropostaDeTema,
  TEMA_PADRAO,
  type TemaEscolhido,
  TemaEscolhidoSchema,
  type TemaId,
  TemaIdSchema,
} from "./temas.js";

/**
 * Regras de segurança do tema (briefing, "Contrato de temas"), aplicadas por código
 * DEPOIS do modelo. O modelo só propõe; quem decide é esta função.
 *
 * Ordem de prioridade: luto > nuclear > conflito > escolha do modelo.
 */

/** Desastre com este número de mortos confirmados ou mais vira luto (PLAN.md, Q3). */
export const LIMITE_VITIMAS_LUTO = 5;

export type RegraDeTema =
  | "id_fora_do_catalogo"
  | "confianca_baixa"
  | "luto_por_sinais"
  | "luto_por_manchetes"
  | "nuclear_por_sinais"
  | "nuclear_por_manchetes"
  | "nuclear_sem_sinal"
  | "conflito_por_sinais"
  | "animal_em_sofrimento"
  | "animal_em_sofrimento_por_manchetes";

export interface ContextoDeTema {
  /** Manchetes do acontecimento do dia, para o veto por palavras. */
  manchetes?: readonly string[];
  /** Título da história do dia, usado no aviso seguro quando o tema é trocado. */
  tituloDaHistoria?: string;
  limiteVitimas?: number;
}

export interface DecisaoDeTema {
  tema: TemaEscolhido;
  /** Regras que alteraram a escolha do modelo. Vazio quando o modelo foi mantido. */
  regras: RegraDeTema[];
}

const TERMOS_DE_MORTE = new Set([
  "morto",
  "mortos",
  "morta",
  "mortas",
  "morte",
  "mortes",
  "morreram",
  "morrem",
  "vítima",
  "vítimas",
  "vitima",
  "vitimas",
  "óbito",
  "óbitos",
  "obito",
  "obitos",
  "killed",
  "kill",
  "kills",
  "dead",
  "death",
  "deaths",
  "toll",
  "died",
  "fatalities",
  "casualties",
]);

const TERMOS_DE_QUANTIDADE = new Set([
  "dezenas",
  "centenas",
  "milhares",
  "dozens",
  "hundreds",
  "thousands",
]);

const TERMOS_DE_MASSACRE =
  /\b(massacre|massacres|chacina|chacinas|atentado|atentados|mass shooting|terror attack|slaughter)\b/iu;

const JANELA_DE_PALAVRAS = 4;

function lerNumero(token: string): number | null {
  if (/^\d{1,3}([.,]\d{3})+$/.test(token)) return Number(token.replace(/[.,]/g, ""));
  if (/^\d+$/.test(token)) {
    const valor = Number(token);
    // Anos (1900 a 2100) não são número de mortos.
    return valor >= 1900 && valor <= 2100 && token.length === 4 ? null : valor;
  }
  return null;
}

/**
 * Veto independente do modelo: as manchetes do acontecimento indicam muitas mortes?
 * Conta como sim: termo de morte perto de um número >= limite, ou de "dezenas/centenas...",
 * ou termo de massacre/atentado junto de um termo de morte (qualquer número).
 */
export function perdaDeVidasNasManchetes(
  manchetes: readonly string[],
  limite: number = LIMITE_VITIMAS_LUTO,
): boolean {
  for (const manchete of manchetes) {
    // O "%" fica colado ao número ("10%" não é número de mortos) e a pontuação das pontas sai.
    const tokens = (manchete.toLowerCase().match(/[\p{L}\p{N}.,%]+/gu) ?? [])
      .map((token) => token.replace(/^[.,]+|[.,]+$/g, ""))
      .filter((token) => token.length > 0);
    const indices = tokens.flatMap((token, i) => (TERMOS_DE_MORTE.has(token) ? [i] : []));
    if (indices.length === 0) continue;

    if (TERMOS_DE_MASSACRE.test(manchete)) return true;

    for (const i of indices) {
      const inicio = Math.max(0, i - JANELA_DE_PALAVRAS);
      const fim = Math.min(tokens.length, i + JANELA_DE_PALAVRAS + 1);
      for (const token of tokens.slice(inicio, fim)) {
        if (TERMOS_DE_QUANTIDADE.has(token)) return true;
        const numero = lerNumero(token);
        if (numero !== null && numero >= limite) return true;
      }
    }
  }
  return false;
}

/**
 * Arma, teste, ataque ou acidente nuclear CONCRETOS (não "acordo nuclear", "energia nuclear" nem
 * "usina nuclear retoma obras"). Veto independente do modelo para o tema `nuclear`.
 */
const FRASES_NUCLEARES: readonly RegExp[] = [
  /\b(?:míssil|missil|mísseis|misseis|ogivas?|bombas?|armas?|ataques?|testes?|ameaças?|acidentes?|vazamentos?|explosões?|detonações?)\b(?:\s+\p{L}+){0,4}\s+(?:nuclear|nucleares|atômic[ao]s?|radioativ[ao]s?)\b/iu,
  /\bnuclear\s+(?:missiles?|weapons?|warheads?|tests?|attacks?|threats?|strikes?|accidents?|bombs?|devices?)\b/iu,
  /\b(?:ataque|atacad[ao]|bombardeio|bombardead[ao]|explosão|vazamento|acidente|incêndio)\b.{0,40}\b(?:usina|central|reator)\s+nuclear/iu,
  /\b(?:usina|central|reator)\s+nuclear\b.{0,40}\b(?:atacad[ao]|bombardead[ao]|explod\p{L}*|vazamento|acidente|incêndio|ataque)\b/iu,
  /\bnuclear\s+(?:power\s+)?(?:plant|reactor)\b.{0,40}\b(?:attack|strike|accident|leak|fire|explosion|shelled|shelling)\b/iu,
  /\b(?:shell(?:ing|ed)|strikes?|attacks?|drones?|explosions?|leaks?|accidents?|fires?)\b.{0,40}\bnuclear\s+(?:power\s+)?(?:plant|reactor)\b/iu,
];

export function armaNuclearNasManchetes(manchetes: readonly string[]): boolean {
  return manchetes.some((manchete) => FRASES_NUCLEARES.some((padrao) => padrao.test(manchete)));
}

const TERMOS_DE_ANIMAL = new Set([
  "cão",
  "cães",
  "cachorro",
  "cachorros",
  "cadela",
  "gato",
  "gatos",
  "gata",
  "animal",
  "animais",
  "filhote",
  "filhotes",
  "capivara",
  "cavalo",
  "égua",
  "tartaruga",
  "onça",
  "macaco",
  "pássaro",
  "ave",
  "aves",
  "dog",
  "cat",
  "puppy",
  "kitten",
]);

const TERMOS_DE_SOFRIMENTO = new Set([
  "ferido",
  "ferida",
  "feridos",
  "feridas",
  "machucado",
  "machucada",
  "maltratado",
  "maltratada",
  "maltratados",
  "maus-tratos",
  "mutilado",
  "mutilada",
  "envenenado",
  "envenenada",
  "atropelado",
  "atropelada",
  "espancado",
  "espancada",
  "queimado",
  "queimada",
  "abandonado",
  "abandonada",
  "desnutrido",
  "desnutrida",
  "torturado",
  "agonia",
  "sofrimento",
  "sofre",
  "morto",
  "morta",
  "morreu",
  "injured",
  "abused",
  "abandoned",
  "dies",
  "died",
]);

/**
 * Animal ferido, maltratado, abandonado ou morto na manchete. Veto independente do modelo
 * para "animal em sofrimento nunca usa ternura_animal".
 */
export function animalEmSofrimentoNasManchetes(manchetes: readonly string[]): boolean {
  return manchetes.some((manchete) => {
    const tokens = (manchete.toLowerCase().match(/[\p{L}\p{N}-]+/gu) ?? []).map((t) =>
      t.replace(/^-+|-+$/g, ""),
    );
    return (
      tokens.some((t) => TERMOS_DE_ANIMAL.has(t)) && tokens.some((t) => TERMOS_DE_SOFRIMENTO.has(t))
    );
  });
}

function cortar(texto: string, maximo: number): string {
  return texto.length <= maximo ? texto : `${texto.slice(0, maximo - 1).trimEnd()}…`;
}

/** Aviso sóbrio, usado quando uma regra troca o tema e o texto do modelo deixa de servir. */
function notificacaoSegura(tituloDaHistoria: string | undefined) {
  const corpo = tituloDaHistoria?.trim() ? tituloDaHistoria.trim() : "Veja o briefing de hoje.";
  return { titulo: "Briefing de hoje", corpo: cortar(corpo, 110) };
}

export function aplicarRegrasDeTema(
  proposta: PropostaDeTema,
  contexto: ContextoDeTema = {},
): DecisaoDeTema {
  const limite = contexto.limiteVitimas ?? LIMITE_VITIMAS_LUTO;
  const { sinais } = proposta;
  const regras: RegraDeTema[] = [];
  let id: TemaId;

  const lutoPorSinais =
    sinais.perdaDeVidas &&
    (sinais.atentadoOuMassacre ||
      sinais.vitimasConfirmadas === null ||
      sinais.vitimasConfirmadas >= limite);

  if (lutoPorSinais) {
    id = "luto";
    regras.push("luto_por_sinais");
  } else if (perdaDeVidasNasManchetes(contexto.manchetes ?? [], limite)) {
    id = "luto";
    regras.push("luto_por_manchetes");
  } else if (sinais.armaOuInstalacaoNuclear) {
    id = "nuclear";
    regras.push("nuclear_por_sinais");
  } else if (armaNuclearNasManchetes(contexto.manchetes ?? [])) {
    id = "nuclear";
    regras.push("nuclear_por_manchetes");
  } else if (sinais.escaladaMilitar) {
    id = "conflito";
    regras.push("conflito_por_sinais");
  } else {
    const proposto = TemaIdSchema.safeParse(proposta.id);
    if (!proposto.success) {
      id = TEMA_PADRAO;
      regras.push("id_fora_do_catalogo");
    } else if (proposta.confianca < CONFIANCA_MINIMA) {
      id = TEMA_PADRAO;
      regras.push("confianca_baixa");
    } else {
      id = proposto.data;
    }
    if (id === "nuclear") {
      id = TEMA_PADRAO;
      regras.push("nuclear_sem_sinal");
    }
    if (id === "ternura_animal") {
      if (sinais.animalEmSofrimento) {
        id = TEMA_PADRAO;
        regras.push("animal_em_sofrimento");
      } else if (animalEmSofrimentoNasManchetes(contexto.manchetes ?? [])) {
        id = TEMA_PADRAO;
        regras.push("animal_em_sofrimento_por_manchetes");
      }
    }
  }

  const trocou = id !== proposta.id;
  const tema = TemaEscolhidoSchema.parse({
    id,
    intensidade: proposta.intensidade,
    confianca: proposta.confianca,
    motivo: trocou
      ? `${proposta.motivo} [ajustado por regra de segurança: ${regras.join(", ")}]`
      : proposta.motivo,
    notificacao: trocou ? notificacaoSegura(contexto.tituloDaHistoria) : proposta.notificacao,
  });

  return { tema, regras: trocou ? regras : [] };
}
