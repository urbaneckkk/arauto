import type { TipoExecucao } from "@arauto/core";
import type {
  OpcoesHttp,
  RespostaHttp,
  ResultadoDaVerificacao,
  Transporte,
} from "../src/infra/transporte.js";
import type { ResultadoDaExecucao } from "../src/pipeline/executar.js";
import type { RepositorioDoServico } from "../src/repo/repositorio.js";
import type { Executor } from "../src/servico/orquestrador.js";
import { dataEmSaoPaulo, type Relogio } from "../src/util/tempo.js";

export type RespostaDeTeste = RespostaHttp | Error;

export function ok(corpo: string, contentType = "application/xml"): RespostaHttp {
  return { status: 200, contentType, corpo };
}

/** Resposta de `verificar` por URL: só o código, ou código e URL final (redirecionamento). */
export type VerificacaoDeTeste = number | { status: number; urlFinal?: string };

/**
 * Transporte de mentira: devolve o que está no mapa e anota as chamadas.
 * `get` de URL fora do mapa dá erro de rede; `verificar` de URL fora do mapa dá 200 sem redirecionamento.
 */
export function transporteDeMapa(
  mapa: Record<string, RespostaDeTeste>,
  verificacoes: Record<string, VerificacaoDeTeste> = {},
): Transporte & { chamadas: string[] } {
  const chamadas: string[] = [];
  return {
    chamadas,
    async get(url: string, _opcoes?: OpcoesHttp) {
      chamadas.push(url);
      const resposta = mapa[url];
      if (resposta === undefined) throw new Error(`rede: sem resposta de teste para ${url}`);
      if (resposta instanceof Error) throw resposta;
      return resposta;
    },
    async verificar(url: string): Promise<ResultadoDaVerificacao> {
      chamadas.push(`verificar ${url}`);
      const v = verificacoes[url] ?? 200;
      return typeof v === "number"
        ? { status: v, urlFinal: url }
        : { status: v.status, urlFinal: v.urlFinal ?? url };
    },
  };
}

/** RSS 2.0 sintético. Todo o conteúdo é inventado. */
export function rss(
  itens: { titulo: string; url: string; data?: string; resumo?: string }[],
): string {
  const corpo = itens
    .map(
      (item) =>
        `<item><title>${item.titulo}</title><link>${item.url}</link>` +
        (item.data ? `<pubDate>${item.data}</pubDate>` : "") +
        (item.resumo ? `<description>${item.resumo}</description>` : "") +
        "</item>",
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Feed de teste</title>${corpo}</channel></rss>`;
}

/** Relógio que anda só quando o teste manda. */
export function relogioAjustavel(inicio: string) {
  let agora = new Date(inicio).getTime();
  return {
    agora: () => new Date(agora),
    avancar(ms: number) {
      agora += ms;
    },
    avancarMinutos(minutos: number) {
      agora += minutos * 60_000;
    },
    avancarDias(dias: number) {
      agora += dias * 24 * 3_600_000;
    },
    definir(instante: string) {
      agora = new Date(instante).getTime();
    },
  };
}
export type RelogioAjustavel = ReturnType<typeof relogioAjustavel>;

export interface ChamadaDoExecutor {
  tipo: TipoExecucao;
  reservaUsd: number;
  id: string;
}

/**
 * Executor de mentira que se comporta como o pipeline em tudo que importa para o serviço: cria a
 * execução no repositório (com a regra de "uma por vez"), avisa que começou, gasta e termina.
 * `segurar()` faz as próximas execuções ficarem "rodando" até `liberar()`.
 */
export function executorFalso(
  repo: RepositorioDoServico,
  relogio: Relogio,
  opcoes: {
    gastoUsd?: number;
    status?: "ok" | "falhou" | "abortado_por_custo";
    quebrarDepoisDeCriar?: boolean;
  } = {},
) {
  const chamadas: ChamadaDoExecutor[] = [];
  let seguro = false;
  let liberacoes: (() => void)[] = [];
  const configuracao = { ...opcoes };

  const executar: Executor = async (tipo, o) => {
    const id = o.gerarId();
    chamadas.push({ tipo, reservaUsd: o.reservaUsd, id });
    const inicio = relogio.agora();
    await repo.criarExecucao({
      id,
      data: dataEmSaoPaulo(inicio),
      tipo,
      criadaEm: inicio.toISOString(),
    });
    o.aoIniciar(id);
    if (seguro) await new Promise<void>((resolve) => liberacoes.push(resolve));
    if (configuracao.quebrarDepoisDeCriar) throw new Error("quebrou no meio");
    const gasto = configuracao.gastoUsd ?? 0;
    if (gasto > 0) {
      await repo.gravarUso(
        id,
        "redacao",
        {
          modelo: "claude-sonnet-5-5",
          tokensEntrada: 1,
          tokensSaida: 1,
          tokensCacheLeitura: 0,
          buscas: 0,
          usd: gasto,
        },
        relogio.agora().toISOString(),
      );
    }
    const status = configuracao.status ?? "ok";
    await repo.atualizarStatus(id, status);
    const resultado: ResultadoDaExecucao = {
      execucaoId: id,
      status,
      briefing: null,
      versao: null,
      avisos: [],
      erro: null,
      gastoUsd: gasto,
      buscas: 0,
      passos: [],
      leitura: null,
      regrasDeTema: [],
    };
    return resultado;
  };

  return {
    executar,
    chamadas,
    segurar() {
      seguro = true;
    },
    liberar() {
      seguro = false;
      for (const liberar of liberacoes) liberar();
      liberacoes = [];
    },
    definir(novas: typeof opcoes) {
      Object.assign(configuracao, novas);
    },
  };
}
