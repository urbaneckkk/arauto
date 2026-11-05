import { z } from "zod";

/** Os 7 passos do pipeline, na ordem do briefing. */
export const PASSOS = [
  "coleta",
  "termometro",
  "apuracao",
  "redacao",
  "verificacao",
  "tema",
  "publicacao",
] as const;
export const PassoSchema = z.enum(PASSOS);
export type Passo = z.infer<typeof PassoSchema>;

/** "Tente de novo 2 vezes por passo": 1 tentativa inicial + 2 repetições. */
export const MAX_TENTATIVAS_POR_PASSO = 3;

export const StatusPassoSchema = z.enum(["ok", "falha", "ignorado"]);
export type StatusPasso = z.infer<typeof StatusPassoSchema>;

export const TIPOS_EXECUCAO = ["diaria", "atualizacao", "plantao"] as const;
export const TipoExecucaoSchema = z.enum(TIPOS_EXECUCAO);
export type TipoExecucao = z.infer<typeof TipoExecucaoSchema>;

export const StatusExecucaoSchema = z.enum([
  "pendente",
  "rodando",
  "ok",
  "falhou",
  "abortado_por_custo",
]);
export type StatusExecucao = z.infer<typeof StatusExecucaoSchema>;

/** Uma chamada a um modelo (ou a uma busca): é daqui que sai o livro-caixa de custos. */
export const UsoDeModeloSchema = z.object({
  modelo: z.string().min(1),
  tokensEntrada: z.number().int().nonnegative(),
  tokensSaida: z.number().int().nonnegative(),
  tokensCacheLeitura: z.number().int().nonnegative(),
  buscas: z.number().int().nonnegative(),
  usd: z.number().nonnegative(),
});
export type UsoDeModelo = z.infer<typeof UsoDeModeloSchema>;

const DataHoraSchema = z.iso.datetime({ offset: true });

/** O que cada passo grava no banco, para depuração. */
export const ResultadoPassoSchema = z
  .object({
    passo: PassoSchema,
    status: StatusPassoSchema,
    tentativa: z.number().int().min(1).max(MAX_TENTATIVAS_POR_PASSO),
    iniciadoEm: DataHoraSchema,
    terminadoEm: DataHoraSchema,
    /** Resumo curto da entrada. Nunca o texto integral de matérias. */
    resumoEntrada: z.string(),
    saida: z.json(),
    erro: z.string().min(1).nullable(),
    usos: z.array(UsoDeModeloSchema),
  })
  .superRefine((resultado, ctx) => {
    if (resultado.status === "falha" && resultado.erro === null) {
      ctx.addIssue({ code: "custom", message: "passo com falha precisa de erro", path: ["erro"] });
    }
    if (resultado.status !== "falha" && resultado.erro !== null) {
      ctx.addIssue({
        code: "custom",
        message: "só passo com falha pode ter erro",
        path: ["erro"],
      });
    }
    if (Date.parse(resultado.terminadoEm) < Date.parse(resultado.iniciadoEm)) {
      ctx.addIssue({
        code: "custom",
        message: "terminadoEm não pode ser anterior a iniciadoEm",
        path: ["terminadoEm"],
      });
    }
  });
export type ResultadoPasso = z.infer<typeof ResultadoPassoSchema>;

export const ExecucaoSchema = z.object({
  id: z.uuid(),
  data: z.iso.date(),
  tipo: TipoExecucaoSchema,
  status: StatusExecucaoSchema,
  criadaEm: DataHoraSchema,
  passos: z.array(ResultadoPassoSchema),
});
export type Execucao = z.infer<typeof ExecucaoSchema>;
