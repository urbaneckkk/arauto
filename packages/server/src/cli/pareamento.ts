import { parseArgs } from "node:util";
import { lerEnv } from "../config/env.js";
import { Acesso } from "../servico/acesso.js";
import { relogioReal } from "../util/tempo.js";
import { abrirRepositorio } from "./ambiente.js";

const AJUDA = `Uso: pnpm pareamento:gerar [--sem-banco]

Gera um código de pareamento de uso único (vale 10 minutos). Digite-o no app do aparelho novo.
O código é gerado aqui, no servidor, e nunca por uma rota aberta da API.

Com Postgres, serve para o servidor que está no ar. Sem banco (--sem-banco) o servidor não vê o
que este comando grava: use "pnpm servidor --sem-banco --codigo" no lugar.`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { "sem-banco": { type: "boolean" }, ajuda: { type: "boolean" } },
    allowPositionals: false,
  });
  if (values.ajuda) {
    console.log(AJUDA);
    return;
  }
  const env = lerEnv();
  const aberto = await abrirRepositorio(values["sem-banco"] === true, env);
  try {
    const acesso = new Acesso({
      repo: aberto.repo,
      relogio: relogioReal,
      inatividadeDias: env.TOKEN_INATIVO_DIAS,
    });
    const { codigo, expiraEm } = await acesso.gerarCodigo();
    console.log(`\nCódigo de pareamento: ${codigo}`);
    console.log(`Vale uma vez, até ${expiraEm} (10 minutos). Erre 5 vezes e ele deixa de valer.`);
  } finally {
    await aberto.fechar();
  }
}

main().catch((erro: unknown) => {
  console.error(`✖ ${erro instanceof Error ? erro.message : String(erro)}`);
  process.exit(1);
});
