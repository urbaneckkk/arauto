import type { NivelAlerta } from "@arauto/core";
import { z } from "zod";
import type { Transporte } from "../infra/transporte.js";
import { isoDeSaoPaulo, UMA_HORA_MS } from "../util/tempo.js";
import type { AlertaDoInmet } from "./tipos.js";

/**
 * A API que o próprio site do INMET usa. Não é documentada: o feed CAP oficial só devolvia
 * redirecionamento vazio em 04/11/2026 (PLAN.md, seção 0.1, item 4).
 */
export const URL_INMET = "https://apiprevmet3.inmet.gov.br/avisos/ativos";

/** Código IBGE de Curitiba. */
export const GEOCODE_CURITIBA = "4106902";

const AvisoSchema = z.object({
  id_aviso: z.number(),
  descricao: z.string(),
  severidade: z.string(),
  data_inicio: z.string(),
  hora_inicio: z.string(),
  data_fim: z.string(),
  hora_fim: z.string(),
  geocodes: z.string(),
  encerrado: z.boolean().optional(),
  riscos: z.array(z.string()).optional(),
  instrucoes: z.array(z.string()).optional(),
});

const RespostaSchema = z.object({
  hoje: z.array(z.unknown()).default([]),
  futuro: z.array(z.unknown()).default([]),
});

/** INMET: "Perigo Potencial" é amarelo, "Perigo" é laranja, "Grande Perigo" é vermelho. */
export function nivelDeSeveridade(severidade: string): NivelAlerta | null {
  const normal = severidade.trim().toLowerCase();
  if (normal === "perigo potencial") return "amarelo";
  if (normal === "perigo") return "laranja";
  if (normal === "grande perigo") return "vermelho";
  return null;
}

/**
 * Alertas ativos que cobrem Curitiba: os de hoje e os que começam nas próximas 36 horas.
 * A cobertura vem da lista de códigos IBGE do aviso, não de texto.
 */
export async function lerAlertasDeCuritiba(
  transporte: Transporte,
  agora: Date,
): Promise<AlertaDoInmet[]> {
  const resposta = await transporte.get(URL_INMET, { timeoutMs: 30_000 });
  if (resposta.status !== 200) throw new Error(`INMET respondeu ${resposta.status}`);
  const bruto = RespostaSchema.parse(JSON.parse(resposta.corpo));

  const alertas: AlertaDoInmet[] = [];
  for (const [quando, avisos] of [
    ["hoje", bruto.hoje],
    ["futuro", bruto.futuro],
  ] as const) {
    for (const item of avisos) {
      const lido = AvisoSchema.safeParse(item);
      if (!lido.success) continue;
      const aviso = lido.data;
      if (aviso.encerrado === true) continue;
      if (!aviso.geocodes.split(",").includes(GEOCODE_CURITIBA)) continue;
      const nivel = nivelDeSeveridade(aviso.severidade);
      if (nivel === null) continue;

      const inicio = isoDeSaoPaulo(aviso.data_inicio.slice(0, 10), aviso.hora_inicio);
      const fim = isoDeSaoPaulo(aviso.data_fim.slice(0, 10), aviso.hora_fim);
      if (quando === "futuro" && Date.parse(inicio) - agora.getTime() > 36 * UMA_HORA_MS) continue;

      alertas.push({
        fonte: "inmet",
        tipo: aviso.descricao,
        nivel,
        inicio,
        fim,
        url: `https://apiprevmet3.inmet.gov.br/avisos/rss/${aviso.id_aviso}`,
        riscos: aviso.riscos ?? [],
        instrucoes: aviso.instrucoes ?? [],
        quando,
      });
    }
  }
  return alertas;
}
