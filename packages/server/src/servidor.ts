import { join } from "node:path";
import { parseArgs } from "node:util";
import { abrirRepositorio } from "./cli/ambiente.js";
import { caminhos } from "./config/caminhos.js";
import { lerEnv, PERFIS } from "./config/env.js";
import { criarApp } from "./http/app.js";
import { logConsole } from "./infra/log.js";
import { TransporteReal } from "./infra/transporte.js";
import { ClienteAnthropic } from "./modelos/anthropic.js";
import { pausaReal } from "./passos/tipos.js";
import { executarPipeline } from "./pipeline/executar.js";
import { Acesso } from "./servico/acesso.js";
import { Agendador } from "./servico/agendador.js";
import { type Executor, Orquestrador } from "./servico/orquestrador.js";
import { relogioReal } from "./util/tempo.js";

const AJUDA = `Uso: pnpm servidor [opções]

Sobe a API, o agendador do briefing das 06:00 e (se existir) a web empacotada.

Opções:
  --sem-banco   guarda tudo em arquivo local, sem Postgres (para desenvolver)
  --codigo      imprime um código de pareamento ao subir (vale 10 minutos, uma vez)
  --ajuda       mostra esta mensagem

Tudo mais vem do .env (veja .env.example). Sem ANTHROPIC_API_KEY o servidor só lê e serve
o que já foi gerado; não gera briefing.`;

/** Tempo que o desligamento espera uma execução em curso antes de sair assim mesmo. */
const ESPERA_NO_DESLIGAMENTO_MS = 20_000;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "sem-banco": { type: "boolean" },
      codigo: { type: "boolean" },
      ajuda: { type: "boolean" },
    },
    allowPositionals: false,
  });
  if (values.ajuda) {
    console.log(AJUDA);
    return;
  }

  const env = lerEnv();
  const aberto = await abrirRepositorio(values["sem-banco"] === true, env);
  const { repo } = aberto;
  const relogio = relogioReal;
  const log = logConsole;
  const perfil = PERFIS[env.PERFIL_CUSTO];

  // O cliente da Anthropic só existe se houver chave. Sem ela, o servidor lê e serve.
  const clienteBase = env.ANTHROPIC_API_KEY ? new ClienteAnthropic(env.ANTHROPIC_API_KEY) : null;
  const executar: Executor = (tipo, opcoes) => {
    if (!clienteBase) throw new Error("Falta ANTHROPIC_API_KEY: o servidor não gera briefings.");
    return executarPipeline(
      {
        repo,
        transporte: new TransporteReal(),
        clienteBase,
        relogio,
        log,
        env,
        perfil,
        pausa: pausaReal,
        gerarId: opcoes.gerarId,
        aoIniciar: opcoes.aoIniciar,
        reservaUsd: opcoes.reservaUsd,
      },
      tipo,
    );
  };

  const orquestrador = new Orquestrador({
    repo,
    executar,
    relogio,
    log,
    limites: {
      atualizacoesPorDia: env.ATUALIZACOES_POR_DIA,
      intervaloEntreAtualizacoesMin: env.INTERVALO_ATUALIZACAO_MIN,
      maxUsdMes: env.MAX_USD_MES,
      pausado: env.GASTOS_PAUSADOS,
      geracaoDisponivel: clienteBase !== null,
    },
  });
  const acesso = new Acesso({ repo, relogio, inatividadeDias: env.TOKEN_INATIVO_DIAS });
  const agendador = new Agendador({ orquestrador, repo, relogio, log });

  const webDist = env.WEB_DIST ?? join(caminhos.raiz, "packages", "web", "dist");
  const app = await criarApp({
    repo,
    acesso,
    orquestrador,
    relogio,
    config: {
      origensPermitidas: env.ORIGENS_PERMITIDAS,
      confiarProxySaltos: env.CONFIAR_PROXY_SALTOS,
      webDist,
      producao: process.env.NODE_ENV === "production",
    },
  });
  await app.listen({ port: env.PORT, host: env.HOST });

  console.log(
    [
      `ARAUTO no ar em http://${env.HOST === "0.0.0.0" ? "localhost" : env.HOST}:${env.PORT}`,
      `  banco: ${aberto.descricao}`,
      `  geração de briefing: ${clienteBase ? "ligada" : "DESLIGADA (sem ANTHROPIC_API_KEY): só leitura"}`,
      `  agendador das 06:00: ${env.AGENDADOR_LIGADO ? "ligado" : "desligado (AGENDADOR_LIGADO=0)"}`,
      `  travas: US$ ${env.MAX_USD_POR_EXECUCAO} por execução, US$ ${env.MAX_USD_MES} por mês${env.GASTOS_PAUSADOS ? " (GASTOS PAUSADOS)" : ""}`,
      `  atualizar agora: ${env.ATUALIZACOES_POR_DIA} por dia, ${env.INTERVALO_ATUALIZACAO_MIN} min entre elas`,
      `  proxies confiáveis: ${env.CONFIAR_PROXY_SALTOS}`,
    ].join("\n"),
  );

  if (values.codigo) {
    const { codigo, expiraEm } = await acesso.gerarCodigo();
    console.log(`\nCódigo de pareamento: ${codigo}  (vale uma vez, até ${expiraEm})`);
  }
  if (env.AGENDADOR_LIGADO) await agendador.iniciar();

  let encerrando = false;
  const encerrar = async (sinal: string) => {
    if (encerrando) return;
    encerrando = true;
    console.log(`\n${sinal}: encerrando...`);
    agendador.parar();
    await app.close();
    // Uma execução em curso ganha alguns segundos. Se não acabar, o próximo início a marca como
    // falha (órfã) e o agendador tenta de novo.
    await Promise.race([
      orquestrador.aguardar(),
      new Promise((resolver) => setTimeout(resolver, ESPERA_NO_DESLIGAMENTO_MS)),
    ]);
    await aberto.fechar();
    process.exit(0);
  };
  process.on("SIGTERM", () => void encerrar("SIGTERM"));
  process.on("SIGINT", () => void encerrar("SIGINT"));
}

main().catch((erro: unknown) => {
  console.error(`✖ ${erro instanceof Error ? erro.message : String(erro)}`);
  process.exit(1);
});
