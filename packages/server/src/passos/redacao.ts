import { LadoSchema, SecaoIdSchema } from "@arauto/core";
import { z } from "zod";
import type { Perfil } from "../config/env.js";
import { lerPrompt } from "../config/prompts.js";
import { type ClienteDeModelo, lerJson } from "../modelos/cliente.js";

/**
 * O que o redator escreve. As fontes são identificadores do material (i042, w03), nunca URLs;
 * o código as transforma em fontes reais depois de verificar cada uma. Restrições de tamanho
 * (3 itens em "Em 30 segundos", teto de notícias) são checadas pelo código, não pelo esquema
 * que vai ao modelo.
 */
export const NoticiaRedigidaSchema = z.object({
  titulo: z.string(),
  oQueAconteceu: z.string(),
  porQueImporta: z.string(),
  lados: z.array(LadoSchema),
  continuaDeOntem: z.string().nullable(),
  fontes: z.array(z.string()),
});
export type NoticiaRedigida = z.infer<typeof NoticiaRedigidaSchema>;

export const RedacaoSchema = z.object({
  historiaDoDia: z.object({ titulo: z.string(), resumo: z.string() }),
  emTrintaSegundos: z.array(z.string()),
  tempoResumo: z.string(),
  secoes: z.array(z.object({ id: SecaoIdSchema, noticias: z.array(NoticiaRedigidaSchema) })),
  curiosidade: NoticiaRedigidaSchema.nullable(),
});
export type Redacao = z.infer<typeof RedacaoSchema>;

export interface DependenciasDaRedacao {
  cliente: ClienteDeModelo;
  modelo: string;
  perfil: Perfil;
}

/** Passo 4: o redator escreve o briefing a partir do material (prompts/editorial.md). */
export async function executarRedacao(
  deps: DependenciasDaRedacao,
  material: string,
  correcao?: string,
): Promise<Redacao> {
  const usuario = correcao
    ? `${material}\n\n## Correção necessária\nA versão anterior foi rejeitada pelo sistema: ${correcao}\nCorrija e entregue o briefing completo de novo.`
    : material;

  const resposta = await deps.cliente.chamar({
    passo: "redacao",
    modelo: deps.modelo,
    sistema: lerPrompt("editorial"),
    usuario,
    maxTokens: 12_000,
    esforco: deps.perfil.esforcoRedacao,
    formato: RedacaoSchema,
  });
  return lerJson("redacao", resposta.texto, RedacaoSchema);
}
