import { z } from "zod";
import { TemaEscolhidoSchema } from "./temas.js";

/** Máximo de notícias por seção (briefing: "2 a 4 notícias por tema"). */
export const NOTICIAS_MAX_POR_SECAO = 4;

/**
 * Teto global de notícias nas seções, fora a curiosidade (PLAN.md, seção 0.1, item 9).
 * É o que faz o briefing caber em ~1.300 palavras.
 */
export const TETO_NOTICIAS = 14;

export const UrlHttpsSchema = z.url({ protocol: /^https$/ });

const DataHoraSchema = z.iso.datetime({ offset: true });

export const FonteSchema = z.object({
  titulo: z.string().min(1),
  url: UrlHttpsSchema,
  publicadoEm: DataHoraSchema,
});
export type Fonte = z.infer<typeof FonteSchema>;

/** Um lado de uma disputa real, atribuído a quem o defende. */
export const LadoSchema = z.object({
  quem: z.string().min(1),
  posicao: z.string().min(1),
});
export type Lado = z.infer<typeof LadoSchema>;

/**
 * "2 a 3 frases" em oQueAconteceu e "1 frase" em porQueImporta são regras
 * editoriais do prompt, não de integridade; contar frases em código seria frágil.
 */
export const NoticiaSchema = z.object({
  titulo: z.string().min(1),
  oQueAconteceu: z.string().min(1),
  porQueImporta: z.string().min(1),
  lados: z.array(LadoSchema),
  continuaDeOntem: z.string().min(1).nullable(),
  fontes: z.array(FonteSchema).min(1),
});
export type Noticia = z.infer<typeof NoticiaSchema>;

export const SECAO_IDS = [
  "politica",
  "economia",
  "agro",
  "tecnologia",
  "seguranca_saude",
  "parana",
  "mundo",
] as const;
export const SecaoIdSchema = z.enum(SECAO_IDS);
export type SecaoId = z.infer<typeof SecaoIdSchema>;

/**
 * O mínimo é 1 e não 2 de propósito: o passo de verificação descarta notícias
 * que falham, e uma seção pode sobrar com uma só. O alvo de 2 a 4 fica no prompt.
 */
export const SecaoSchema = z.object({
  id: SecaoIdSchema,
  noticias: z.array(NoticiaSchema).min(1).max(NOTICIAS_MAX_POR_SECAO),
});
export type Secao = z.infer<typeof SecaoSchema>;

export const ALERTA_FONTES = ["inmet", "simepar", "defesa_civil_pr"] as const;

/** INMET: "Perigo Potencial" = amarelo, "Perigo" = laranja, "Grande Perigo" = vermelho. */
export const NivelAlertaSchema = z.enum(["amarelo", "laranja", "vermelho"]);
export type NivelAlerta = z.infer<typeof NivelAlertaSchema>;

export const AlertaSchema = z
  .object({
    fonte: z.enum(ALERTA_FONTES),
    tipo: z.string().min(1),
    nivel: NivelAlertaSchema,
    inicio: DataHoraSchema,
    fim: DataHoraSchema,
    url: UrlHttpsSchema.optional(),
  })
  .refine((alerta) => Date.parse(alerta.fim) >= Date.parse(alerta.inicio), {
    message: "o fim do alerta não pode ser anterior ao início",
    path: ["fim"],
  });
export type Alerta = z.infer<typeof AlertaSchema>;

export const TempoSchema = z
  .object({
    minC: z.number().min(-60).max(60),
    maxC: z.number().min(-60).max(60),
    chuvaPct: z.number().int().min(0).max(100),
    resumo: z.string().min(1),
    alertas: z.array(AlertaSchema),
  })
  .refine((tempo) => tempo.minC <= tempo.maxC, {
    message: "a mínima não pode ser maior que a máxima",
    path: ["minC"],
  });
export type Tempo = z.infer<typeof TempoSchema>;

/**
 * `pontuacaoParcial` é verdadeiro quando o GDELT falhou e a pontuação saiu só do RSS
 * (PLAN.md, seção 0.1, item 3). Ausente nos dados antigos, vale falso.
 */
export const HistoriaDoDiaSchema = z.object({
  titulo: z.string().min(1),
  resumo: z.string().min(1),
  veiculos: z.number().int().nonnegative(),
  paises: z.number().int().nonnegative(),
  pontuacao: z.number().min(0).max(1),
  pontuacaoParcial: z.boolean().default(false),
});
export type HistoriaDoDia = z.infer<typeof HistoriaDoDiaSchema>;

export const CustoSchema = z.object({
  usd: z.number().nonnegative(),
  buscas: z.number().int().nonnegative(),
});
export type Custo = z.infer<typeof CustoSchema>;

/** Contrato do briefing (briefing original, "Contrato do briefing"). */
export const BriefingSchema = z
  .object({
    data: z.iso.date(),
    historiaDoDia: HistoriaDoDiaSchema,
    tema: TemaEscolhidoSchema,
    emTrintaSegundos: z.array(z.string().min(1)).length(3),
    tempo: TempoSchema,
    secoes: z.array(SecaoSchema).min(1),
    /** Nulo quando não houver uma curiosidade boa: nunca se preenche lacuna com texto inventado. */
    curiosidade: NoticiaSchema.nullable(),
    custo: CustoSchema,
  })
  .superRefine((briefing, ctx) => {
    const ids = briefing.secoes.map((secao) => secao.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: "custom",
        message: "uma seção não pode aparecer duas vezes",
        path: ["secoes"],
      });
    }
    const total = briefing.secoes.reduce((soma, secao) => soma + secao.noticias.length, 0);
    if (total > TETO_NOTICIAS) {
      ctx.addIssue({
        code: "custom",
        message: `o briefing tem ${total} notícias; o teto é ${TETO_NOTICIAS}`,
        path: ["secoes"],
      });
    }
  });
export type Briefing = z.infer<typeof BriefingSchema>;
