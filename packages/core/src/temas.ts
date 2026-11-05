import { z } from "zod";

/**
 * Catálogo fechado de temas (briefing, "Contrato de temas").
 * Tema fora desta lista não existe: o código sempre cai em TEMA_PADRAO.
 */
export const TEMA_IDS = [
  "neutro",
  "ternura_animal",
  "conflito",
  "nuclear",
  "clima_extremo",
  "mercado_alta",
  "mercado_queda",
  "ciencia_espaco",
  "tecnologia_ia",
  "agro_safra",
  "politica",
  "saude",
  "esporte",
  "cultura",
  "luto",
] as const;

export const TemaIdSchema = z.enum(TEMA_IDS);
export type TemaId = z.infer<typeof TemaIdSchema>;

export const TEMA_PADRAO: TemaId = "neutro";

/** Abaixo desta confiança o tema vira TEMA_PADRAO (regra aplicada na Etapa 1). */
export const CONFIANCA_MINIMA = 0.7;

/** 1 discreta, 2 normal, 3 forte. */
export const IntensidadeSchema = z.literal([1, 2, 3]);
export type Intensidade = z.infer<typeof IntensidadeSchema>;

/**
 * Qualquer valor que não seja um id do catálogo vira "neutro", sem erro.
 * É o que garante "tema desconhecido cai em neutro" no servidor e na web.
 */
export function normalizarTemaId(valor: unknown): TemaId {
  const resultado = TemaIdSchema.safeParse(valor);
  return resultado.success ? resultado.data : TEMA_PADRAO;
}

/** Texto do aviso: o modelo só escolhe isto, nunca cor, código ou animação. */
export const NotificacaoSchema = z.object({
  titulo: z.string().min(1).max(40),
  corpo: z.string().min(1).max(110),
});
export type Notificacao = z.infer<typeof NotificacaoSchema>;

/** Tema já decidido, como aparece no briefing publicado. */
export const TemaEscolhidoSchema = z.object({
  id: TemaIdSchema,
  intensidade: IntensidadeSchema,
  confianca: z.number().min(0).max(1),
  motivo: z.string().min(1),
  notificacao: NotificacaoSchema,
});
export type TemaEscolhido = z.infer<typeof TemaEscolhidoSchema>;

/**
 * Ficha de sinais: perguntas fechadas que o modelo responde sobre a história do dia.
 * O código decide o tema a partir delas (regras de segurança, Etapa 1), porque
 * "o fato central é a perda de vidas" não é decidível só por código.
 */
export const SinaisDoTemaSchema = z.object({
  perdaDeVidas: z.boolean(),
  vitimasConfirmadas: z.number().int().nonnegative().nullable(),
  /** Massacre, atentado ou chacina: conta como luto com qualquer número de mortos. */
  atentadoOuMassacre: z.boolean(),
  escaladaMilitar: z.boolean(),
  armaOuInstalacaoNuclear: z.boolean(),
  animalEmSofrimento: z.boolean(),
});
export type SinaisDoTema = z.infer<typeof SinaisDoTemaSchema>;

/**
 * Saída crua do passo "Tema" (Haiku). Ainda não é confiável: o id é texto livre
 * de propósito, para um id inventado virar "neutro" em vez de derrubar o passo.
 */
export const PropostaDeTemaSchema = z.object({
  id: z.string(),
  intensidade: IntensidadeSchema,
  confianca: z.number().min(0).max(1),
  motivo: z.string().min(1),
  notificacao: NotificacaoSchema,
  sinais: SinaisDoTemaSchema,
});
export type PropostaDeTema = z.infer<typeof PropostaDeTemaSchema>;

export const DURACAO_ABERTURA_MIN_MS = 1500;
export const DURACAO_ABERTURA_MAX_MS = 2500;

/**
 * Conteúdo de themes/<id>/meta.json.
 * ATENÇÃO: o formato de `som` é provisório. Só o pacote do Claude Design (Etapa 2)
 * vai dizer se precisa de mais que um booleano.
 */
export const ThemeMetaSchema = z
  .object({
    id: TemaIdSchema,
    nome: z.string().min(1),
    intensidades: z
      .array(IntensidadeSchema)
      .min(1)
      .refine((valores) => new Set(valores).size === valores.length, {
        message: "intensidades não pode repetir valores",
      }),
    som: z.boolean(),
    emoji: z.string().min(1),
    duracaoAberturaMs: z.number().int().min(DURACAO_ABERTURA_MIN_MS).max(DURACAO_ABERTURA_MAX_MS),
  })
  .refine((meta) => !(meta.id === "luto" && meta.som), {
    message: "o tema luto nunca tem som",
    path: ["som"],
  });
export type ThemeMeta = z.infer<typeof ThemeMetaSchema>;
