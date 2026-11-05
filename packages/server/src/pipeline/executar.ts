import { randomUUID } from "node:crypto";
import {
  type Briefing,
  MAX_TENTATIVAS_POR_PASSO,
  type Passo,
  type ResultadoPasso,
  type TipoExecucao,
  type UsoDeModelo,
} from "@arauto/core";
import { coletar } from "../coleta/coletar.js";
import type { ResultadoDaColeta } from "../coleta/tipos.js";
import type { Env, Perfil } from "../config/env.js";
import { Orcamento, OrcamentoEsgotado } from "../custo/orcamento.js";
import type { Logger } from "../infra/log.js";
import type { Transporte } from "../infra/transporte.js";
import { ClienteComOrcamento, type ClienteDeModelo } from "../modelos/cliente.js";
import { executarApuracao, type ResultadoDaApuracao } from "../passos/apuracao.js";
import { type Leitura, medirLeitura } from "../passos/leitura.js";
import { montarMaterial } from "../passos/material.js";
import { montarBriefing } from "../passos/montagem.js";
import { executarRedacao, type Redacao } from "../passos/redacao.js";
import { executarTema, temaDeEmergencia } from "../passos/tema.js";
import { executarTermometro } from "../passos/termometro.js";
import { type ItemDeMaterial, type Pausa, paraMaterial } from "../passos/tipos.js";
import {
  ErroDeVerificacao,
  type ResultadoDaVerificacao,
  verificarRedacao,
} from "../passos/verificacao.js";
import type { Repositorio } from "../repo/repositorio.js";
import { dataEmSaoPaulo, mesEmSaoPaulo, type Relogio } from "../util/tempo.js";

/** Com menos itens que isso, a coleta é considerada falha (feeds fora do ar ou rede caída). */
export const MINIMO_DE_ITENS = 30;
/** Briefing pronto até as 06:30 com início às 06:00: passou disso, mostra o de ontem. */
export const PRAZO_TOTAL_MS = 25 * 60_000;
const PAUSA_ENTRE_TENTATIVAS_MS = 2_000;

export interface DependenciasDoPipeline {
  repo: Repositorio;
  transporte: Transporte;
  /** Cliente "puro" (real, gravador ou replay). As travas de custo são aplicadas aqui dentro. */
  clienteBase: ClienteDeModelo;
  relogio: Relogio;
  log: Logger;
  env: Pick<
    Env,
    "MAX_USD_POR_EXECUCAO" | "MAX_USD_MES" | "GASTOS_PAUSADOS" | "MODELO_BARATO" | "MODELO_REDATOR"
  >;
  perfil: Perfil;
  pausa: Pausa;
  gerarId?: () => string;
  /**
   * Chamado assim que a execução existe no banco, antes do trabalho pesado. A API usa para
   * responder "iniciada" já com o id, sem esperar o briefing ficar pronto.
   */
  aoIniciar?: (execucaoId: string) => void;
  /** Verba do mês reservada aos briefings diários que ainda vão rodar (só atualizações usam). */
  reservaUsd?: number;
}

export type StatusFinal = "ok" | "falhou" | "abortado_por_custo";

export interface ResultadoDaExecucao {
  execucaoId: string;
  status: StatusFinal;
  briefing: Briefing | null;
  versao: number | null;
  avisos: string[];
  erro: string | null;
  gastoUsd: number;
  buscas: number;
  passos: ResultadoPasso[];
  leitura: Leitura | null;
  regrasDeTema: string[];
}

type Json = ResultadoPasso["saida"];
type Tentativa<T> = { ok: true; valor: T } | { ok: false; erro: Error };

/** Executa o pipeline inteiro (briefing, passos 1 a 7) e grava cada passo para depuração. */
export async function executarPipeline(
  deps: DependenciasDoPipeline,
  tipo: TipoExecucao = "diaria",
): Promise<ResultadoDaExecucao> {
  const { repo, transporte, clienteBase, relogio, log, env, perfil, pausa } = deps;
  const inicio = relogio.agora();
  const execucaoId = (deps.gerarId ?? randomUUID)();
  const data = dataEmSaoPaulo(inicio);

  await repo.criarExecucao({ id: execucaoId, data, tipo, criadaEm: inicio.toISOString() });
  deps.aoIniciar?.(execucaoId);
  const orcamento = new Orcamento({
    maxExecucaoUsd: env.MAX_USD_POR_EXECUCAO,
    maxMesUsd: env.MAX_USD_MES,
    gastoDoMesAntesUsd: await repo.gastoDoMesUsd(mesEmSaoPaulo(inicio)),
    pausado: env.GASTOS_PAUSADOS,
    reservaUsd: deps.reservaUsd ?? 0,
  });
  const cliente = new ClienteComOrcamento(clienteBase, orcamento, repo, execucaoId, relogio);

  const passos: ResultadoPasso[] = [];
  const avisos: string[] = [];

  /** Uma tentativa de um passo: mede, grava e devolve o resultado sem lançar (exceto custo). */
  async function tentar<T>(
    nome: Passo,
    tentativa: number,
    resumoEntrada: string,
    corpo: () => Promise<T>,
    resumirSaida: (valor: T) => Json,
  ): Promise<Tentativa<T>> {
    const iniciadoEm = relogio.agora();
    if (iniciadoEm.getTime() - inicio.getTime() > PRAZO_TOTAL_MS) {
      throw new Error(
        `Prazo de ${PRAZO_TOTAL_MS / 60_000} minutos esgotado antes do passo "${nome}".`,
      );
    }
    const usosAntes = orcamento.todosOsUsos.length;
    const usosDoPasso = (): UsoDeModelo[] => orcamento.todosOsUsos.slice(usosAntes);
    log.info(`▶ ${nome} (tentativa ${tentativa})`);

    let resultado: Tentativa<T>;
    try {
      resultado = { ok: true, valor: await corpo() };
    } catch (erro) {
      resultado = { ok: false, erro: erro instanceof Error ? erro : new Error(String(erro)) };
    }

    const registro: ResultadoPasso = {
      passo: nome,
      status: resultado.ok ? "ok" : "falha",
      tentativa,
      iniciadoEm: iniciadoEm.toISOString(),
      terminadoEm: relogio.agora().toISOString(),
      resumoEntrada,
      saida: resultado.ok ? resumirSaida(resultado.valor) : null,
      erro: resultado.ok ? null : resultado.erro.message,
      usos: usosDoPasso(),
    };
    passos.push(registro);
    await repo.gravarPasso(execucaoId, registro);

    if (!resultado.ok) {
      log.erro(`${nome} (tentativa ${tentativa}): ${resultado.erro.message}`);
      // Trava de custo não se repete: para tudo.
      if (resultado.erro instanceof OrcamentoEsgotado) throw resultado.erro;
    }
    return resultado;
  }

  /** O passo com até MAX_TENTATIVAS_POR_PASSO tentativas. Devolve null se todas falharem. */
  async function comRepeticoes<T>(
    nome: Passo,
    resumoEntrada: string,
    corpo: () => Promise<T>,
    resumirSaida: (valor: T) => Json,
  ): Promise<{ valor: T } | { erro: Error }> {
    let ultimoErro = new Error(`O passo "${nome}" não rodou.`);
    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_POR_PASSO; tentativa++) {
      const resultado = await tentar(nome, tentativa, resumoEntrada, corpo, resumirSaida);
      if (resultado.ok) return { valor: resultado.valor };
      ultimoErro = resultado.erro;
      if (tentativa < MAX_TENTATIVAS_POR_PASSO) await pausa(PAUSA_ENTRE_TENTATIVAS_MS * tentativa);
    }
    return { erro: ultimoErro };
  }

  const encerrar = async (
    status: StatusFinal,
    erro: string | null,
    extras: Partial<ResultadoDaExecucao> = {},
  ): Promise<ResultadoDaExecucao> => {
    await repo.atualizarStatus(execucaoId, status);
    return {
      execucaoId,
      status,
      briefing: null,
      versao: null,
      avisos,
      erro,
      gastoUsd: orcamento.gastoDaExecucaoUsd,
      buscas: orcamento.buscasDaExecucao,
      passos,
      leitura: null,
      regrasDeTema: [],
      ...extras,
    };
  };

  try {
    // 1. Coleta (sem IA)
    const coletado = await comRepeticoes(
      "coleta",
      "feeds, previsão do tempo e alertas do INMET",
      async () => {
        const resultado = await coletar({ transporte, relogio, log });
        if (resultado.itens.length < MINIMO_DE_ITENS) {
          throw new Error(
            `Só ${resultado.itens.length} itens recentes foram coletados (mínimo ${MINIMO_DE_ITENS}): feeds fora do ar ou rede com problema.`,
          );
        }
        return resultado;
      },
      (r): Json => ({
        itens: r.itens.length,
        feedsAtivos: r.saude.filter((s) => s.situacao === "ok").length,
        feedsTotal: r.saude.length,
        saude: r.saude.map((s) => ({ feed: s.feedId, situacao: s.situacao, itens: s.itens })),
        alertas: r.alertas.length,
        temPrevisao: r.tempo !== null,
        avisos: r.avisos,
      }),
    );
    if ("erro" in coletado) return await encerrar("falhou", coletado.erro.message);
    const coleta: ResultadoDaColeta = coletado.valor;
    avisos.push(...coleta.avisos);

    // 2. Termômetro do mundo (Haiku agrupa; o código pontua)
    const termometroResultado = await comRepeticoes(
      "termometro",
      `${coleta.itens.length} manchetes`,
      () =>
        executarTermometro(
          { cliente, transporte, relogio, log, modelo: env.MODELO_BARATO, pausa },
          coleta.itens,
        ),
      (t): Json => ({
        acontecimentos: t.clusters.length,
        historiaDoDia: t.historiaDoDia.titulo,
        pontuacao: t.historiaDoDia.pontuacao,
        parcial: t.parcial,
        gdeltConsultas: t.gdeltConsultas,
        gdeltFalhas: t.gdeltFalhas,
        topo: t.clusters.slice(0, 15).map((c) => ({
          titulo: c.titulo,
          categoria: c.categoria,
          pontuacao: c.pontuacao,
          veiculos: c.veiculos,
          itens: c.itens.length,
        })),
      }),
    );
    if ("erro" in termometroResultado)
      return await encerrar("falhou", termometroResultado.erro.message);
    const termometro = termometroResultado.valor;
    if (termometro.parcial) {
      avisos.push(
        "Pontuação parcial: o GDELT não respondeu e a história do dia foi escolhida só com o RSS.",
      );
    }

    // 3. Apuração (Sonnet com busca web). Falhar não derruba o briefing: o RSS basta.
    const apuracaoResultado = await comRepeticoes(
      "apuracao",
      `história do dia, até ${perfil.maxBuscas} buscas`,
      () =>
        executarApuracao(
          { cliente, relogio, log, modelo: env.MODELO_REDATOR, perfil },
          termometro,
          coleta.alertas,
        ),
      (a): Json => ({
        buscas: a.buscas,
        achados: a.itens.length,
        temasFracos: a.temasFracos,
        notas: a.texto,
      }),
    );
    let apuracao: ResultadoDaApuracao | null = null;
    if ("erro" in apuracaoResultado) {
      avisos.push(
        `Apuração por busca indisponível (${apuracaoResultado.erro.message}); o briefing usa só os feeds.`,
      );
    } else {
      apuracao = apuracaoResultado.valor;
    }

    // Registro de tudo que pode ser citado como fonte.
    const registro = new Map<string, ItemDeMaterial>();
    for (const item of coleta.itens) registro.set(item.id, paraMaterial(item));
    for (const item of apuracao?.itens ?? []) registro.set(item.id, item);

    const ultimo = await repo.ultimoBriefing();
    const ontem = ultimo && ultimo.data < data ? ultimo : null;
    const material = montarMaterial({ agora: inicio, termometro, coleta, apuracao, ontem, perfil });

    // 4 e 5. Redação e verificação: se a verificação reprova, a redação refaz com o motivo.
    let redacao: Redacao | null = null;
    let verificado: ResultadoDaVerificacao | null = null;
    let correcao: string | undefined;
    let ultimoErro = "A redação não rodou.";
    for (let rodada = 1; rodada <= MAX_TENTATIVAS_POR_PASSO && !verificado; rodada++) {
      const escrita = await tentar(
        "redacao",
        rodada,
        correcao ? `material + correção: ${correcao.slice(0, 120)}` : "material do dia",
        () => executarRedacao({ cliente, modelo: env.MODELO_REDATOR, perfil }, material, correcao),
        (r): Json => JSON.parse(JSON.stringify(r)) as Json,
      );
      if (!escrita.ok) {
        ultimoErro = escrita.erro.message;
        correcao = escrita.erro.message;
        if (rodada < MAX_TENTATIVAS_POR_PASSO) await pausa(PAUSA_ENTRE_TENTATIVAS_MS * rodada);
        continue;
      }
      redacao = escrita.valor;

      const conferencia = await tentar(
        "verificacao",
        rodada,
        `${redacao.secoes.length} seções`,
        () => verificarRedacao({ transporte, relogio, log }, escrita.valor, registro),
        (v): Json => ({
          noticias: v.secoes.reduce((soma, s) => soma + s.noticias.length, 0),
          secoes: v.secoes.map((s) => s.id),
          temCuriosidade: v.curiosidade !== null,
          fontesVerificadas: v.fontesVerificadas,
          fontesRecusadas: v.fontesRecusadas,
          descartes: v.descartes.map((d) => ({ onde: d.onde, motivo: d.motivo })),
        }),
      );
      if (conferencia.ok) {
        verificado = conferencia.valor;
      } else {
        ultimoErro = conferencia.erro.message;
        // Só a reprovação de conteúdo volta para o redator; erro de rede etc. não adianta refazer a redação.
        if (!(conferencia.erro instanceof ErroDeVerificacao)) break;
        correcao = conferencia.erro.message;
      }
    }
    if (!redacao || !verificado) return await encerrar("falhou", ultimoErro);
    if (verificado.descartes.length > 0) {
      avisos.push(
        `${verificado.descartes.length} item(ns) descartado(s) na verificação de fontes.`,
      );
    }

    // 6. Tema (Haiku propõe; as regras de segurança decidem)
    const historiaParaTema = {
      titulo: redacao.historiaDoDia.titulo,
      resumo: redacao.historiaDoDia.resumo,
      manchetes: termometro.historiaDoDia.itens.map((item) => item.titulo),
    };
    let decisao = temaDeEmergencia(historiaParaTema);
    let temaPeloModelo = false;
    try {
      const temaResultado = await comRepeticoes(
        "tema",
        redacao.historiaDoDia.titulo,
        () => executarTema({ cliente, modelo: env.MODELO_BARATO }, historiaParaTema),
        (d): Json => JSON.parse(JSON.stringify(d)) as Json,
      );
      if ("valor" in temaResultado) {
        decisao = temaResultado.valor;
        temaPeloModelo = true;
      }
    } catch (erro) {
      // Sem verba para o passo do tema: publica com o tema neutro, que não custa nada.
      if (!(erro instanceof OrcamentoEsgotado)) throw erro;
      avisos.push(`Trava de custo atingida antes do passo do tema: ${erro.message}`);
    }
    if (!temaPeloModelo) {
      avisos.push("O tema foi escolhido por segurança (neutro), porque o passo do modelo falhou.");
    }
    if (decisao.regras.length > 0) {
      avisos.push(`Regras de segurança alteraram o tema: ${decisao.regras.join(", ")}.`);
    }

    // 7. Publicação
    const briefing = montarBriefing({
      data,
      historia: termometro.historiaDoDia,
      redacao,
      verificado,
      tema: decisao.tema,
      coleta,
      custo: { usd: orcamento.gastoDaExecucaoUsd, buscas: orcamento.buscasDaExecucao },
    });
    const leitura = medirLeitura(briefing);
    const versao = await repo.gravarBriefing({
      data,
      execucaoId,
      tipo,
      criadoEm: relogio.agora().toISOString(),
      briefing,
      avisos,
    });
    const publicacao = relogio.agora().toISOString();
    const registroFinal: ResultadoPasso = {
      passo: "publicacao",
      status: "ok",
      tentativa: 1,
      iniciadoEm: publicacao,
      terminadoEm: publicacao,
      resumoEntrada: "briefing validado pelo contrato",
      saida: { data, versao, palavras: leitura.palavras, minutos: leitura.minutos },
      erro: null,
      usos: [],
    };
    passos.push(registroFinal);
    await repo.gravarPasso(execucaoId, registroFinal);

    log.info(
      `✔ Briefing de ${data} publicado (versão ${versao}): ${leitura.palavras} palavras, ~${leitura.minutos} min.`,
    );
    return await encerrar("ok", null, { briefing, versao, leitura, regrasDeTema: decisao.regras });
  } catch (erro) {
    if (erro instanceof OrcamentoEsgotado) {
      log.erro(`TRAVA DE CUSTO: ${erro.message}`);
      return await encerrar("abortado_por_custo", erro.message);
    }
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    log.erro(`Falha inesperada: ${mensagem}`);
    return await encerrar("falhou", mensagem);
  }
}
