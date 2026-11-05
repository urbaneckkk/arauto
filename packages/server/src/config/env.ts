import { z } from "zod";

export const PERFIS_DE_CUSTO = ["economico", "padrao"] as const;
export type PerfilDeCusto = (typeof PERFIS_DE_CUSTO)[number];

const TextoOpcional = z.string().min(1).optional();

/** "1"/"true" liga, "0"/"false" desliga; o padrão vale quando a variável não existe. */
const Interruptor = (padrao: "0" | "1") =>
  z
    .enum(["0", "1", "true", "false"])
    .default(padrao)
    .transform((valor) => valor === "1" || valor === "true");

/** Lista separada por vírgulas ("a,b,c") → ["a", "b", "c"], sem itens vazios. */
const Lista = z
  .string()
  .default("")
  .transform((texto) =>
    texto
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item !== ""),
  );

const EnvSchema = z.object({
  ANTHROPIC_API_KEY: TextoOpcional,
  DATABASE_URL: TextoOpcional,
  /** Trava por execução, em dólares (briefing: MAX_USD_POR_EXECUCAO=1). */
  MAX_USD_POR_EXECUCAO: z.coerce.number().positive().default(1),
  /** Trava mensal, em dólares (briefing: MAX_USD_MES=25). */
  MAX_USD_MES: z.coerce.number().positive().default(25),
  PERFIL_CUSTO: z.enum(PERFIS_DE_CUSTO).default("padrao"),
  /** Interruptor geral: com 1, nenhuma chamada paga é feita (PLAN.md, seção 2.8). */
  GASTOS_PAUSADOS: Interruptor("0"),
  MODELO_BARATO: z.string().min(1).default("claude-haiku-5-5"),
  MODELO_REDATOR: z.string().min(1).default("claude-sonnet-5-5"),

  // --- Servidor (Etapa 2) ---
  /** O Railway define PORT sozinho. */
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default("0.0.0.0"),
  /** Pasta do build da web, servida como arquivos estáticos. Padrão: packages/web/dist. */
  WEB_DIST: TextoOpcional,
  /** Origens extras aceitas pelo CORS, além das cascas do Tauri e do Capacitor. */
  ORIGENS_PERMITIDAS: Lista,
  /**
   * Quantos proxies confiáveis existem na frente do servidor (0 em casa; no Railway, 1).
   * Errar para mais deixa o cliente forjar o IP e fugir do limite por IP.
   */
  CONFIAR_PROXY_SALTOS: z.coerce.number().int().min(0).max(5).default(0),
  /** Dias sem uso até um aparelho pareado precisar parear de novo. */
  TOKEN_INATIVO_DIAS: z.coerce.number().int().positive().default(90),
  /** "Atualizar agora": no máximo isto por dia, somando todos os aparelhos (briefing). */
  ATUALIZACOES_POR_DIA: z.coerce.number().int().positive().default(3),
  /** ...e com este intervalo mínimo entre elas, em minutos. */
  INTERVALO_ATUALIZACAO_MIN: z.coerce.number().int().positive().default(30),
  /** Com 0, o servidor atende a API mas não dispara o briefing das 06:00 (útil em desenvolvimento). */
  AGENDADOR_LIGADO: Interruptor("1"),
});

export type Env = z.infer<typeof EnvSchema>;

/** Lê e valida o ambiente. Valor vazio (`CHAVE=`) conta como ausente. */
export function lerEnv(fonte: Record<string, string | undefined> = process.env): Env {
  const limpo = Object.fromEntries(
    Object.entries(fonte).filter(([, valor]) => valor !== undefined && valor.trim() !== ""),
  );
  const resultado = EnvSchema.safeParse(limpo);
  if (!resultado.success) {
    const problemas = resultado.error.issues
      .map((problema) => `${problema.path.join(".")}: ${problema.message}`)
      .join("; ");
    throw new Error(`Configuração inválida no ambiente (.env): ${problemas}`);
  }
  return resultado.data;
}

/** O que cada perfil de custo faz (PLAN.md, seção 3.3). */
export interface Perfil {
  nome: PerfilDeCusto;
  maxBuscas: number;
  esforcoApuracao: "low" | "medium" | "high";
  esforcoRedacao: "low" | "medium" | "high";
  /** Quantos acontecimentos por seção o redator recebe. */
  candidatosPorSecao: number;
}

export const PERFIS: Record<PerfilDeCusto, Perfil> = {
  economico: {
    nome: "economico",
    maxBuscas: 3,
    esforcoApuracao: "low",
    esforcoRedacao: "medium",
    candidatosPorSecao: 5,
  },
  padrao: {
    nome: "padrao",
    maxBuscas: 8,
    esforcoApuracao: "medium",
    esforcoRedacao: "medium",
    candidatosPorSecao: 7,
  },
};
