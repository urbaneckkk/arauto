import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Sql } from "./postgres.js";

/** Pasta das migrações: packages/server/migrations (duas acima de src/repo ou dist/repo). */
const PASTA = fileURLToPath(new URL("../../migrations/", import.meta.url));

/**
 * Aplica, em ordem, as migrações `NNN_nome.sql` que ainda não rodaram. Cada uma roda dentro de
 * uma transação junto com o registro de que foi aplicada. Devolve os nomes aplicados agora.
 */
export async function migrar(sql: Sql, pasta = PASTA): Promise<string[]> {
  await sql`create table if not exists _migracoes (
    nome text primary key,
    aplicada_em timestamptz not null default now()
  )`;
  const aplicadas = new Set(
    (await sql<{ nome: string }[]>`select nome from _migracoes`).map((l) => l.nome),
  );
  const arquivos = readdirSync(pasta)
    .filter((nome) => /^\d{3}_.+\.sql$/.test(nome))
    .sort();

  const agora: string[] = [];
  for (const nome of arquivos) {
    if (aplicadas.has(nome)) continue;
    const conteudo = readFileSync(`${pasta}${nome}`, "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(conteudo);
      await tx`insert into _migracoes (nome) values (${nome})`;
    });
    agora.push(nome);
  }
  return agora;
}
