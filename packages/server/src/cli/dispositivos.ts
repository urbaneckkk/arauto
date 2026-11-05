import { parseArgs } from "node:util";
import { lerEnv } from "../config/env.js";
import { Acesso } from "../servico/acesso.js";
import { formatarDataHora, relogioReal } from "../util/tempo.js";
import { abrirRepositorio } from "./ambiente.js";

const AJUDA = `Uso: pnpm dispositivos listar [--sem-banco]
     pnpm dispositivos revogar <id> [--sem-banco]

listar   mostra os aparelhos pareados (nunca o token, que não fica guardado)
revogar  o aparelho perde o acesso na mesma hora; para voltar, é preciso parear de novo`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: { "sem-banco": { type: "boolean" }, ajuda: { type: "boolean" } },
    allowPositionals: true,
  });
  const [comando, id] = positionals;
  if (values.ajuda || !comando) {
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
    if (comando === "listar") {
      const lista = await acesso.listar();
      if (lista.length === 0) console.log("Nenhum aparelho pareado.");
      for (const d of lista) {
        const estado = d.revogadoEm ? `REVOGADO em ${formatarDataHora(d.revogadoEm)}` : "ativo";
        const uso = d.ultimoUsoEm ? formatarDataHora(d.ultimoUsoEm) : "nunca usado";
        console.log(`${d.id}  ${d.nome.padEnd(24)} ${estado}  · último uso: ${uso}`);
      }
    } else if (comando === "revogar") {
      if (!id) throw new Error("Informe o id do aparelho: pnpm dispositivos revogar <id>");
      const revogou = await acesso.revogar(id);
      console.log(revogou ? "Aparelho revogado." : "Nada feito: id desconhecido ou já revogado.");
      if (!revogou) process.exitCode = 1;
    } else {
      throw new Error(`Comando desconhecido "${comando}". Use listar ou revogar.`);
    }
  } finally {
    await aberto.fechar();
  }
}

main().catch((erro: unknown) => {
  console.error(`✖ ${erro instanceof Error ? erro.message : String(erro)}`);
  process.exit(1);
});
