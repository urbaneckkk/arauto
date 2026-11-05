import { fileURLToPath } from "node:url";

/** Raiz do repositório. Este arquivo fica em packages/server/{src,dist}/config/, quatro níveis abaixo. */
const raiz = fileURLToPath(new URL("../../../../", import.meta.url));

export const caminhos = {
  raiz,
  prompts: `${raiz}prompts`,
  /** Gravações de HTTP e de modelo, para testar sem gastar API. Fora do Git (direitos autorais). */
  gravacoes: `${raiz}gravacoes`,
  /** Briefings gerados e estado local (sem banco). Fora do Git. */
  saida: `${raiz}saida`,
} as const;
