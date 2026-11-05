import { join } from "node:path";
import { caminhos } from "../config/caminhos.js";
import type { Env } from "../config/env.js";
import { RepositorioEmArquivo } from "../repo/arquivo.js";
import { migrar } from "../repo/migrar.js";
import { conectar, RepositorioPostgres } from "../repo/postgres.js";
import type { Repositorio } from "../repo/repositorio.js";

export interface RepositorioAberto {
  repo: Repositorio;
  descricao: string;
  fechar(): Promise<void>;
}

export const ARQUIVO_DE_ESTADO_LOCAL = join(caminhos.saida, "estado-local.json");

/**
 * Escolhe onde gravar: Postgres (DATABASE_URL) ou um arquivo local (`--sem-banco`).
 * No Postgres, as migrações pendentes são aplicadas na hora.
 */
export async function abrirRepositorio(
  semBanco: boolean,
  env: Env,
  arquivoDeEstado: string = ARQUIVO_DE_ESTADO_LOCAL,
): Promise<RepositorioAberto> {
  if (semBanco) {
    return {
      repo: new RepositorioEmArquivo(arquivoDeEstado),
      descricao: `arquivo local (${arquivoDeEstado})`,
      async fechar() {},
    };
  }
  if (!env.DATABASE_URL) {
    throw new Error(
      "Não há banco configurado. Escolha um jeito:\n" +
        "  1. Rodar sem banco, guardando em arquivo local: acrescente --sem-banco\n" +
        "  2. Subir o Postgres local (docker compose up -d) e deixar DATABASE_URL no .env (veja .env.example)",
    );
  }
  const sql = conectar(env.DATABASE_URL);
  const aplicadas = await migrar(sql);
  return {
    repo: new RepositorioPostgres(sql),
    descricao: `Postgres${aplicadas.length > 0 ? ` (migrações aplicadas: ${aplicadas.join(", ")})` : ""}`,
    fechar: () => sql.end({ timeout: 5 }),
  };
}
