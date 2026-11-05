import { z } from "zod";
import { BriefingSchema } from "./briefing.js";

/**
 * JSON Schema do briefing, gerado a partir do Zod (uma só fonte de verdade).
 * É a base da saída estruturada do modelo; na Etapa 1 ela é adaptada ao subconjunto
 * de JSON Schema que a API aceita, e o Zod continua sendo quem valida de verdade.
 */
export function jsonSchemaDoBriefing() {
  return z.toJSONSchema(BriefingSchema, { io: "input" });
}
