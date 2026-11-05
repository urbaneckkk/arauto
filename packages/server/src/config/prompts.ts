import { readFileSync } from "node:fs";
import { join } from "node:path";
import { caminhos } from "./caminhos.js";

export type NomeDePrompt = "editorial" | "termometro" | "apuracao" | "tema";

/** Lê um prompt de `prompts/<nome>.md`. Os prompts são arquivos do repositório, revisáveis no Git. */
export function lerPrompt(nome: NomeDePrompt): string {
  return readFileSync(join(caminhos.prompts, `${nome}.md`), "utf8").trim();
}
