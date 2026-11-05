import { parseArgs } from "node:util";
import { lerEnv } from "../config/env.js";
import { Orcamento } from "../custo/orcamento.js";
import { ClienteAnthropic } from "../modelos/anthropic.js";
import { ClienteComOrcamento } from "../modelos/cliente.js";
import { RepositorioEmMemoria } from "../repo/memoria.js";
import { mesEmSaoPaulo, relogioReal } from "../util/tempo.js";
import { aprovado, CASOS_DE_TEMA, rodarTodosOsCasos } from "./casos-de-tema.js";

const AJUDA = `Uso: pnpm tema:testar [--repeticoes N]

Roda os casos fictícios de tema do critério de aceite (resgate de filhote, escalada militar, míssil
nuclear, queda de avião, bombardeio com civis mortos, animal ferido, bolsas, sonda em Marte e três
casos adversariais) contra o MODELO REAL, N vezes cada (padrão 5, máximo 20).

Os casos críticos (luto, nuclear, animal ferido) precisam de 100%. Custa centavos: só o Haiku 5.5.
Código de saída: 0 se todos os críticos passaram, 1 se algum falhou.`;

const usd = (v: number) => `US$ ${v.toFixed(4)}`;

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { repeticoes: { type: "string" }, ajuda: { type: "boolean" } },
    allowPositionals: false,
  });
  if (values.ajuda) {
    console.log(AJUDA);
    return 0;
  }
  const repeticoes = Math.min(20, Math.max(1, Number(values.repeticoes ?? 5)));
  if (!Number.isInteger(repeticoes)) throw new Error("--repeticoes precisa ser um número inteiro.");

  const env = lerEnv();
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error(
      "Falta ANTHROPIC_API_KEY no .env (veja .env.example). Este teste chama o modelo de verdade.",
    );
  }

  const repo = new RepositorioEmMemoria();
  const orcamento = new Orcamento({
    maxExecucaoUsd: env.MAX_USD_POR_EXECUCAO,
    maxMesUsd: env.MAX_USD_MES,
    gastoDoMesAntesUsd: 0,
    pausado: env.GASTOS_PAUSADOS,
  });
  const cliente = new ClienteComOrcamento(
    new ClienteAnthropic(env.ANTHROPIC_API_KEY),
    orcamento,
    repo,
    "teste-de-tema",
    relogioReal,
  );

  const chamadas = CASOS_DE_TEMA.length * repeticoes;
  console.log(
    `Testando ${CASOS_DE_TEMA.length} casos × ${repeticoes} repetições = ${chamadas} chamadas ao ${env.MODELO_BARATO}...`,
  );
  const resultados = await rodarTodosOsCasos(cliente, env.MODELO_BARATO, repeticoes);

  console.log("\nCaso".padEnd(66), "acertos", "crítico", "respostas");
  for (const r of resultados) {
    const ok = r.acertos === r.repeticoes;
    const respostas = Object.entries(r.respostas)
      .map(([id, n]) => `${id}×${n}`)
      .join(" ");
    console.log(
      `${ok ? "✔" : "✖"} ${r.caso.descricao}`.padEnd(64),
      `${r.acertos}/${r.repeticoes}`.padStart(7),
      (r.caso.critico ? "sim" : "não").padStart(7),
      " ",
      respostas,
      r.falhasDoModelo > 0 ? `(falhas do modelo: ${r.falhasDoModelo})` : "",
    );
  }

  const gasto = orcamento.gastoDaExecucaoUsd;
  const passou = aprovado(resultados);
  console.log(`\nCusto: ${usd(gasto)} (${mesEmSaoPaulo(relogioReal.agora())}).`);
  console.log(
    passou
      ? "✔ APROVADO: 100% nos casos críticos (luto, nuclear, animal ferido)."
      : "✖ REPROVADO: algum caso crítico não ficou em 100%. Não avance para a Etapa 2.",
  );
  return passou ? 0 : 1;
}

main()
  .then((codigo) => process.exit(codigo))
  .catch((erro: unknown) => {
    console.error(`✖ ${erro instanceof Error ? erro.message : String(erro)}`);
    process.exit(1);
  });
