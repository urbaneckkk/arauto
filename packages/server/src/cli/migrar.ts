import { lerEnv } from "../config/env.js";
import { migrar } from "../repo/migrar.js";
import { conectar } from "../repo/postgres.js";

/** Aplica as migrações pendentes no banco de DATABASE_URL. */
async function main(): Promise<number> {
  const env = lerEnv();
  if (!env.DATABASE_URL) {
    throw new Error("Falta DATABASE_URL no .env (veja .env.example).");
  }
  const sql = conectar(env.DATABASE_URL);
  try {
    const aplicadas = await migrar(sql);
    console.log(
      aplicadas.length > 0
        ? `Migrações aplicadas: ${aplicadas.join(", ")}`
        : "Banco já está em dia.",
    );
    return 0;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main()
  .then((codigo) => process.exit(codigo))
  .catch((erro: unknown) => {
    console.error(`✖ ${erro instanceof Error ? erro.message : String(erro)}`);
    process.exit(1);
  });
