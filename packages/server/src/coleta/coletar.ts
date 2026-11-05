import { FEEDS } from "../config/feeds.js";
import type { Logger } from "../infra/log.js";
import type { Transporte } from "../infra/transporte.js";
import { emParalelo } from "../util/paralelo.js";
import { type Relogio, UMA_HORA_MS } from "../util/tempo.js";
import { cortar, limparHtml } from "../util/texto.js";
import { urlCanonica } from "../util/url.js";
import { lerAlertasDeCuritiba } from "./inmet.js";
import { lerTempo } from "./openmeteo.js";
import { lerFeed } from "./rss.js";
import type {
  AlertaDoInmet,
  DadosDoTempo,
  FeedConfig,
  ItemColetado,
  ResultadoDaColeta,
  SaudeDoFeed,
} from "./tipos.js";

/** Só entra no briefing o que foi publicado nas últimas 36 horas (briefing, passo 5). */
export const JANELA_DE_NOTICIAS_HORAS = 36;
/** Um feed cujo item mais novo é mais velho que isso é considerado parado. */
const FEED_PARADO_APOS_HORAS = 72;
const LIMITE_PADRAO_POR_FEED = 40;
const TAMANHO_DO_RESUMO = 300;

export interface DependenciasDaColeta {
  transporte: Transporte;
  relogio: Relogio;
  log: Logger;
  feeds?: readonly FeedConfig[];
  concorrencia?: number;
}

interface ItemSemId extends Omit<ItemColetado, "id"> {}

async function lerUmFeed(
  feed: FeedConfig,
  transporte: Transporte,
  agora: Date,
): Promise<{ saude: SaudeDoFeed; itens: ItemSemId[] }> {
  const inicio = Date.now();
  const ms = () => Date.now() - inicio;
  try {
    const resposta = await transporte.get(feed.url);
    if (resposta.status !== 200) {
      return {
        saude: {
          feedId: feed.id,
          situacao: "fora",
          status: resposta.status,
          itens: 0,
          maisRecente: null,
          ms: ms(),
        },
        itens: [],
      };
    }
    const lidos = lerFeed(resposta.corpo);
    const datas = lidos.flatMap((item) => (item.data ? [item.data] : []));
    // Datas ISO ordenam como texto: a última da lista ordenada é a mais recente.
    const maisRecente = [...datas].sort().at(-1) ?? null;

    const limiteDeData = agora.getTime() - JANELA_DE_NOTICIAS_HORAS * UMA_HORA_MS;
    const futuroTolerado = agora.getTime() + UMA_HORA_MS;
    const recentes = lidos
      .flatMap((item) => {
        const url = urlCanonica(item.url);
        const titulo = limparHtml(item.titulo);
        if (!item.data || !url || titulo === "") return [];
        const instante = Date.parse(item.data);
        if (instante < limiteDeData || instante > futuroTolerado) return [];
        const base: ItemSemId = {
          feedId: feed.id,
          veiculo: feed.veiculo,
          pais: feed.pais,
          idioma: feed.idioma,
          titulo,
          url,
          publicadoEm: item.data,
          resumo: cortar(limparHtml(item.resumo), TAMANHO_DO_RESUMO),
        };
        return [feed.dica ? { ...base, dica: feed.dica } : base];
      })
      .sort((a, b) => b.publicadoEm.localeCompare(a.publicadoEm))
      .slice(0, feed.limite ?? LIMITE_PADRAO_POR_FEED);

    let situacao: SaudeDoFeed["situacao"] = "ok";
    if (lidos.length === 0) situacao = "vazio";
    else if (
      !maisRecente ||
      agora.getTime() - Date.parse(maisRecente) > FEED_PARADO_APOS_HORAS * UMA_HORA_MS
    ) {
      situacao = "parado";
    }
    return {
      saude: {
        feedId: feed.id,
        situacao,
        status: resposta.status,
        itens: lidos.length,
        maisRecente,
        ms: ms(),
      },
      itens: recentes,
    };
  } catch (erro) {
    return {
      saude: {
        feedId: feed.id,
        situacao: "fora",
        status: null,
        itens: 0,
        maisRecente: null,
        ms: ms(),
        erro: erro instanceof Error ? erro.message : String(erro),
      },
      itens: [],
    };
  }
}

/** Passo 1 do pipeline (sem IA): feeds, tempo e alertas. O GDELT entra no passo 2. */
export async function coletar(deps: DependenciasDaColeta): Promise<ResultadoDaColeta> {
  const { transporte, relogio, log } = deps;
  const feeds = deps.feeds ?? FEEDS;
  const agora = relogio.agora();
  const avisos: string[] = [];

  log.info(`Coleta: lendo ${feeds.length} feeds...`);
  const lidos = await emParalelo(feeds, deps.concorrencia ?? 6, (feed) =>
    lerUmFeed(feed, transporte, agora),
  );

  const saude = lidos.map((l) => l.saude);
  const nomeDoFeed = (id: string) => {
    const feed = feeds.find((f) => f.id === id);
    return feed ? `${feed.veiculo} · ${feed.nome}` : id;
  };
  // Uma linha por situação (e não uma por feed): com muitos feeds ruins, a lista não vira um paredão.
  const grupos: [SaudeDoFeed["situacao"], string][] = [
    ["fora", "Feeds fora do ar"],
    ["vazio", "Feeds vazios"],
    ["parado", "Feeds parados"],
  ];
  for (const [situacao, titulo] of grupos) {
    const doGrupo = saude.filter((s) => s.situacao === situacao);
    if (doGrupo.length === 0) continue;
    avisos.push(
      `${titulo} (${doGrupo.length}): ${doGrupo.map((s) => nomeDoFeed(s.feedId)).join(", ")}`,
    );
  }

  // Junta tudo, tira repetidos pela URL (o primeiro feed vence) e numera.
  const vistos = new Set<string>();
  const itens: ItemColetado[] = [];
  for (const { itens: doFeed } of lidos) {
    for (const item of doFeed) {
      if (vistos.has(item.url)) continue;
      vistos.add(item.url);
      itens.push({ ...item, id: `i${String(itens.length + 1).padStart(3, "0")}` });
    }
  }

  let tempo: DadosDoTempo | null = null;
  try {
    tempo = await lerTempo(transporte);
  } catch (erro) {
    avisos.push(
      `Previsão do tempo indisponível: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }

  let alertas: AlertaDoInmet[] = [];
  try {
    alertas = await lerAlertasDeCuritiba(transporte, agora);
  } catch (erro) {
    avisos.push(
      `Alertas do INMET indisponíveis: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }

  const ativos = saude.filter((s) => s.situacao === "ok").length;
  log.info(
    `Coleta: ${itens.length} itens recentes, ${ativos}/${feeds.length} feeds ativos, ${alertas.length} alertas para Curitiba.`,
  );

  return { agora: agora.toISOString(), itens, saude, tempo, alertas, avisos };
}
