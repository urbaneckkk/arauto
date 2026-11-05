import { TEMA_IDS, type TemaId } from "@arauto/core";
import { useSyncExternalStore } from "react";

export type Modo = "stories" | "lista";

export interface Prefs {
  /** null = escolher pelo tamanho da tela (Stories no celular, Lista no computador). */
  modo: Modo | null;
  /** Modo sóbrio: sempre o tema neutro, discreto. */
  sobrio: boolean;
  /** Troca manual de tema. null = o tema do dia. */
  temaManual: TemaId | null;
  /** Velocidade da voz do modo Ouvir. */
  velocidade: number;
  /** "AAAA-MM-DD#versão" do último briefing cuja abertura já passou. */
  visto: string | null;
}

export const PADRAO: Prefs = {
  modo: null,
  sobrio: false,
  temaManual: null,
  velocidade: 1,
  visto: null,
};

const CHAVE = "arauto:prefs:v1";

/** Lê o que veio do armazenamento, aceitando só valores válidos (dado velho ou mexido à mão não quebra o app). */
export function limparPrefs(bruto: unknown): Prefs {
  const o = (typeof bruto === "object" && bruto !== null ? bruto : {}) as Record<string, unknown>;
  const modo = o.modo === "stories" || o.modo === "lista" ? o.modo : null;
  const tema = TEMA_IDS.find((id) => id === o.temaManual) ?? null;
  const velocidade =
    typeof o.velocidade === "number" && o.velocidade >= 0.7 && o.velocidade <= 1.6
      ? o.velocidade
      : 1;
  return {
    modo,
    sobrio: o.sobrio === true,
    temaManual: tema,
    velocidade,
    visto: typeof o.visto === "string" ? o.visto : null,
  };
}

function ler(): Prefs {
  try {
    const texto = window.localStorage.getItem(CHAVE);
    return texto ? limparPrefs(JSON.parse(texto)) : PADRAO;
  } catch {
    return PADRAO;
  }
}

let atual: Prefs = typeof window === "undefined" ? PADRAO : ler();
const ouvintes = new Set<() => void>();

export function salvarPrefs(mudanca: Partial<Prefs>): void {
  atual = { ...atual, ...mudanca };
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(atual));
  } catch {
    // Armazenamento bloqueado (aba privada): a preferência vale só até fechar o app.
  }
  for (const ouvinte of ouvintes) ouvinte();
}

function assinar(aviso: () => void): () => void {
  ouvintes.add(aviso);
  return () => ouvintes.delete(aviso);
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    assinar,
    () => atual,
    () => PADRAO,
  );
}

const TELA_ESTREITA = "(max-width: 720px)";

function assinarTela(aviso: () => void): () => void {
  const consulta = window.matchMedia(TELA_ESTREITA);
  consulta.addEventListener("change", aviso);
  return () => consulta.removeEventListener("change", aviso);
}

/** Stories no celular, Lista no computador, a menos que a pessoa tenha escolhido. */
export function escolherModo(prefs: Prefs, telaEstreita: boolean): Modo {
  return prefs.modo ?? (telaEstreita ? "stories" : "lista");
}

export function useModo(): Modo {
  const prefs = usePrefs();
  const estreita = useSyncExternalStore(
    assinarTela,
    () => window.matchMedia(TELA_ESTREITA).matches,
    () => false,
  );
  return escolherModo(prefs, estreita);
}
