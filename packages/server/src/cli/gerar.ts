import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { caminhos } from "../config/caminhos.js";
import { type Env, lerEnv, PERFIS, PERFIS_DE_CUSTO, type PerfilDeCusto } from "../config/env.js";
import { logConsole } from "../infra/log.js";
import {
  type Transporte,
  TransporteGravador,
  TransporteReal,
  TransporteReplay,
} from "../infra/transporte.js";
import { ClienteAnthropic } from "../modelos/anthropic.js";
import type { ClienteDeModelo } from "../modelos/cliente.js";
import { ClienteGravador, ClienteReplay } from "../modelos/gravacao.js";
import { pausaReal, semPausa } from "../passos/tipos.js";
import { executarPipeline, type ResultadoDaExecucao } from "../pipeline/executar.js";
import { RepositorioEmMemoria } from "../repo/memoria.js";
import { mesEmSaoPaulo, type Relogio, relogioFixo, relogioReal } from "../util/tempo.js";
import { abrirRepositorio } from "./ambiente.js";

const AJUDA = `Uso: pnpm brief:gerar [opções]

Gera o briefing do dia (pipeline completo: coleta, termômetro, apuração, redação, verificação, tema).

Opções:
  --sem-banco        guarda tudo em arquivo local, sem Postgres
  --perfil <nome>    economico (até 3 buscas) ou padrao (até 8). Padrão: PERFIL_CUSTO do .env
  --gravar <nome>    roda de verdade e grava a internet e o modelo em gravacoes/<nome>
  --replay <nome>    repete uma gravação: não usa a internet, não chama o modelo, não gasta nada
  --ajuda            mostra esta mensagem

A chave da Anthropic (ANTHROPIC_API_KEY) e as travas de custo vêm do arquivo .env na raiz.
Código de saída: 0 ok, 1 falhou, 2 parou por trava de custo.`;

interface Manifesto {
  agora: string;
  perfil: PerfilDeCusto;
  gravadoEm: string;
}

function exigirChave(env: Env): string {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error(
      "Falta a chave da Anthropic. Copie .env.example para .env (na raiz do projeto) e preencha ANTHROPIC_API_KEY.\n" +
        "Para testar sem gastar, use --replay <gravação>.",
    );
  }
  return env.ANTHROPIC_API_KEY;
}

const usd = (valor: number) => `US$ ${valor.toFixed(4)}`;

function imprimirResumo(
  resultado: ResultadoDaExecucao,
  extras: { gastoDoMes: number; env: Env; replay: boolean },
): void {
  const { env } = extras;
  console.log("\n══ RESUMO DA EXECUÇÃO ══");
  console.log(
    `Resultado: ${{ ok: "OK", falhou: "FALHOU", abortado_por_custo: "PAROU POR TRAVA DE CUSTO" }[resultado.status]}`,
  );
  if (resultado.erro) console.log(`Motivo: ${resultado.erro}`);

  console.log("\nPassos:");
  for (const p of resultado.passos) {
    const duracao = ((Date.parse(p.terminadoEm) - Date.parse(p.iniciadoEm)) / 1000).toFixed(1);
    const custo = p.usos.reduce((soma, uso) => soma + uso.usd, 0);
    console.log(
      `  ${p.status === "ok" ? "✔" : "✖"} ${p.passo.padEnd(12)} tentativa ${p.tentativa}  ${duracao.padStart(6)} s  ${usd(custo)}${p.erro ? `  ← ${p.erro.slice(0, 90)}` : ""}`,
    );
  }

  const tokens = resultado.passos.flatMap((p) => p.usos);
  console.log(
    `\nTokens: ${tokens.reduce((s, u) => s + u.tokensEntrada, 0)} de entrada, ${tokens.reduce((s, u) => s + u.tokensSaida, 0)} de saída · buscas: ${resultado.buscas}`,
  );
  console.log(
    `Custo desta execução: ${usd(resultado.gastoUsd)} (trava por execução ${usd(env.MAX_USD_POR_EXECUCAO)})` +
      (extras.replay ? "  [REPLAY: valor da gravação, nada foi cobrado]" : ""),
  );
  if (!extras.replay) {
    console.log(`Gasto no mês: ${usd(extras.gastoDoMes)} de ${usd(env.MAX_USD_MES)}`);
  }

  if (resultado.leitura) {
    const { palavras, minutos } = resultado.leitura;
    const dentro = minutos >= 5 && minutos <= 7;
    console.log(
      `Leitura: ${palavras} palavras ≈ ${minutos} min ${dentro ? "(dentro do alvo de 5 a 7)" : "(FORA do alvo de 5 a 7)"}`,
    );
  }
  if (resultado.briefing) {
    console.log(
      `Tema: ${resultado.briefing.tema.id}${resultado.regrasDeTema.length > 0 ? ` (ajustado por: ${resultado.regrasDeTema.join(", ")})` : ""}`,
    );
  }
  if (resultado.avisos.length > 0) {
    console.log("\nAvisos:");
    for (const aviso of resultado.avisos) console.log(`  - ${aviso}`);
  }
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      "sem-banco": { type: "boolean" },
      perfil: { type: "string" },
      gravar: { type: "string" },
      replay: { type: "string" },
      ajuda: { type: "boolean" },
    },
    allowPositionals: false,
  });
  if (values.ajuda) {
    console.log(AJUDA);
    return 0;
  }
  if (values.gravar && values.replay) throw new Error("Use --gravar ou --replay, não os dois.");

  const env = lerEnv();
  const nomePerfil = values.perfil ?? env.PERFIL_CUSTO;
  if (!PERFIS_DE_CUSTO.includes(nomePerfil as PerfilDeCusto)) {
    throw new Error(`Perfil desconhecido "${nomePerfil}". Use: ${PERFIS_DE_CUSTO.join(" ou ")}.`);
  }
  const perfil = PERFIS[nomePerfil as PerfilDeCusto];

  let transporte: Transporte;
  let clienteBase: ClienteDeModelo;
  let relogio: Relogio = relogioReal;
  let pausa = pausaReal;
  const replay = values.replay !== undefined;

  if (replay) {
    const pasta = join(caminhos.gravacoes, values.replay as string);
    const arquivo = join(pasta, "manifesto.json");
    if (!existsSync(arquivo))
      throw new Error(`Gravação "${values.replay}" não encontrada em ${pasta}`);
    const manifesto = JSON.parse(readFileSync(arquivo, "utf8")) as Manifesto;
    relogio = relogioFixo(new Date(manifesto.agora));
    transporte = new TransporteReplay(pasta);
    clienteBase = new ClienteReplay(pasta);
    pausa = semPausa;
    console.log(
      `REPLAY da gravação "${values.replay}" (de ${manifesto.gravadoEm}): sem internet, sem modelo, sem custo.`,
    );
  } else {
    const chave = exigirChave(env);
    transporte = new TransporteReal();
    clienteBase = new ClienteAnthropic(chave);
    if (values.gravar) {
      const pasta = join(caminhos.gravacoes, values.gravar);
      mkdirSync(pasta, { recursive: true });
      const manifesto: Manifesto = {
        agora: relogio.agora().toISOString(),
        perfil: perfil.nome,
        gravadoEm: new Date().toISOString(),
      };
      writeFileSync(join(pasta, "manifesto.json"), JSON.stringify(manifesto, null, 2), "utf8");
      transporte = new TransporteGravador(transporte, pasta);
      clienteBase = new ClienteGravador(clienteBase, pasta);
      console.log(
        `GRAVANDO em gravacoes/${values.gravar} (esta execução é real e custa dinheiro).`,
      );
    }
  }

  // Em replay nada é gravado em lugar nenhum: o repositório é de memória.
  const aberto = replay
    ? { repo: new RepositorioEmMemoria(), descricao: "memória (replay)", fechar: async () => {} }
    : await abrirRepositorio(values["sem-banco"] === true, env);

  try {
    const gastoAntes = await aberto.repo.gastoDoMesUsd(mesEmSaoPaulo(relogio.agora()));
    console.log(
      `Perfil ${perfil.nome} (até ${perfil.maxBuscas} buscas) · banco: ${aberto.descricao}\n` +
        `Travas: ${usd(env.MAX_USD_POR_EXECUCAO)} por execução, ${usd(env.MAX_USD_MES)} por mês (já gasto no mês: ${usd(gastoAntes)})` +
        (env.GASTOS_PAUSADOS ? "\n⚠ GASTOS_PAUSADOS=1: nenhuma chamada paga será feita." : ""),
    );

    const resultado = await executarPipeline({
      repo: aberto.repo,
      transporte,
      clienteBase,
      relogio,
      log: logConsole,
      env,
      perfil,
      pausa,
    });

    // Cópia em arquivo, para ler e conferir sem abrir o banco.
    mkdirSync(caminhos.saida, { recursive: true });
    if (resultado.briefing) {
      const arquivo = join(
        caminhos.saida,
        `briefing-${resultado.briefing.data}${replay ? "-replay" : ""}.json`,
      );
      writeFileSync(arquivo, JSON.stringify(resultado.briefing, null, 2), "utf8");
      console.log(`\nBriefing salvo em ${arquivo}`);
    }
    writeFileSync(
      join(caminhos.saida, `execucao-${resultado.execucaoId}.json`),
      JSON.stringify({ ...resultado, briefing: undefined }, null, 2),
      "utf8",
    );

    imprimirResumo(resultado, {
      gastoDoMes: await aberto.repo.gastoDoMesUsd(mesEmSaoPaulo(relogio.agora())),
      env,
      replay,
    });
    if (resultado.status === "ok")
      console.log("\nPara ler: pnpm brief:ver" + (values["sem-banco"] ? " --sem-banco" : ""));
    return resultado.status === "ok" ? 0 : resultado.status === "abortado_por_custo" ? 2 : 1;
  } finally {
    await aberto.fechar();
  }
}

main()
  .then((codigo) => process.exit(codigo))
  .catch((erro: unknown) => {
    console.error(`✖ ${erro instanceof Error ? erro.message : String(erro)}`);
    process.exit(1);
  });
