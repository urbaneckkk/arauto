import { z } from "zod";

export const PERFIS_DE_CUSTO = ["economico", "padrao"] as const;
export type PerfilDeCusto = (typeof PERFIS_DE_CUSTO)[number];

const TextoOpcional = z.string().min(1).optional();

const EnvSchema = z.object({
  ANTHROPIC_API_KEY: TextoOpcional,
  DATABASE_URL: TextoOpcional,
  /** Trava por execução, em dólares (briefing: MAX_USD_POR_EXECUCAO=1). */
  MAX_USD_POR_EXECUCAO: z.coerce.number().positive().default(1),
  /** Trava mensal, em dólares (briefing: MAX_USD_MES=25). */
  MAX_USD_MES: z.coerce.number().positive().default(25),
  PERFIL_CUSTO: z.enum(PERFIS_DE_CUSTO).default("padrao"),
  /** Interruptor geral: com 1, nenhuma chamada paga é feita (PLAN.md, seção 2.8). */
  GASTOS_PAUSADOS: z
    .enum(["0", "1", "true", "false"])
    .default("0")
    .transform((valor) => valor === "1" || valor === "true"),
  MODELO_BARATO: z.string().min(1).default("claude-haiku-5-5"),
  MODELO_REDATOR: z.string().min(1).default("claude-sonnet-5-5"),
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
