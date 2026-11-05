import { BriefingSchema } from "@arauto/core";
import { z } from "zod";

/** Onde o site está publicado (ex.: "/arauto/"). Os briefings ficam em <base>briefing/. */
const BASE = import.meta.env.BASE_URL;

/**
 * Um briefing publicado. O `briefing` é validado pelo MESMO contrato do servidor (@arauto/core):
 * arquivo corrompido ou de outra versão não chega à tela.
 */
export const RegistroSchema = z.object({
  data: z.string(),
  versao: z.number(),
  criadoEm: z.string(),
  briefing: BriefingSchema,
  avisos: z.array(z.string()).default([]),
});
export type Registro = z.infer<typeof RegistroSchema>;

export const IndiceSchema = z.array(
  z.object({ data: z.string(), titulo: z.string(), tema: z.string(), versao: z.number() }),
);
export type ItemDoIndice = z.infer<typeof IndiceSchema>[number];

async function buscarJson(caminho: string): Promise<unknown> {
  const resposta = await fetch(`${BASE}briefing/${caminho}`, { cache: "no-store" });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  return resposta.json();
}

/** Último briefing publicado. Lança erro se não houver rede nem cópia guardada. */
export async function carregarUltimo(): Promise<Registro> {
  return RegistroSchema.parse(await buscarJson("ultimo.json"));
}

export async function carregarDia(data: string): Promise<Registro> {
  return RegistroSchema.parse(await buscarJson(`${data}.json`));
}

export async function carregarIndice(): Promise<ItemDoIndice[]> {
  return IndiceSchema.parse(await buscarJson("indice.json"));
}
