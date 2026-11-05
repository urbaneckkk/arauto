import type { SecaoId } from "@arauto/core";
import type { ItemColetado } from "../coleta/tipos.js";

/** Categoria de um acontecimento. `descartar` fica fora do briefing. */
export type Categoria = SecaoId | "curiosidade" | "descartar";

/**
 * Qualquer coisa que o redator pode citar como fonte: um item de feed (id i001...) ou um
 * achado da busca web (id w01...). Achado sem data confiável tem `publicadoEm` nulo e não
 * passa na verificação das 36 horas.
 */
export interface ItemDeMaterial extends Omit<ItemColetado, "publicadoEm"> {
  publicadoEm: string | null;
  origem: "feed" | "busca";
}

export function paraMaterial(item: ItemColetado): ItemDeMaterial {
  return { ...item, origem: "feed" };
}

export type Pausa = (ms: number) => Promise<void>;
export const pausaReal: Pausa = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
export const semPausa: Pausa = async () => {};
