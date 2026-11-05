import {
  type Fonte,
  NOTICIAS_MAX_POR_SECAO,
  type Noticia,
  type Secao,
  TETO_NOTICIAS,
} from "@arauto/core";
import { JANELA_DE_NOTICIAS_HORAS } from "../coleta/coletar.js";
import {
  DOMINIOS_DE_REDIRECIONAMENTO,
  DOMINIOS_PERMITIDOS,
  DOMINIOS_QUE_BLOQUEIAM_SCRIPT,
} from "../config/dominios.js";
import type { Logger } from "../infra/log.js";
import type { Transporte } from "../infra/transporte.js";
import { emParalelo } from "../util/paralelo.js";
import { type Relogio, UMA_HORA_MS } from "../util/tempo.js";
import { hostDe, pertenceAoDominio, urlCanonica } from "../util/url.js";
import type { NoticiaRedigida, Redacao } from "./redacao.js";
import type { ItemDeMaterial } from "./tipos.js";

/** A verificação reprovou o briefing de um jeito que a redação pode tentar corrigir. */
export class ErroDeVerificacao extends Error {
  constructor(detalhe: string) {
    super(detalhe);
    this.name = "ErroDeVerificacao";
  }
}

export interface Descarte {
  onde: string;
  motivo: string;
}

export interface ResultadoDaVerificacao {
  secoes: Secao[];
  curiosidade: Noticia | null;
  descartes: Descarte[];
  fontesVerificadas: number;
  fontesRecusadas: number;
}

type Avaliacao = { ok: true; fonte: Fonte } | { ok: false; motivo: string };

/**
 * Calibrado na 1ª execução real: com 8 palavras o filtro descartava fatos curtos inevitáveis
 * ("o líder do governo no Congresso, Fulano", "mais de 7 mil denúncias de assédio") e jogou fora 7 de
 * 17 notícias. A única cópia de verdade tinha 16 palavras. Com 12, pega prosa copiada.
 */
const TAMANHO_DO_TRECHO_COPIADO = 12;
const CONCORRENCIA_HTTP = 6;

function palavras(texto: string): string[] {
  return texto.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * Há uma sequência de `tamanho` palavras idênticas entre o texto e alguma referência?
 * Barra cópia de trechos de matéria ("escreva com suas palavras").
 */
export function temTrechoCopiado(
  texto: string,
  referencias: readonly string[],
  tamanho = TAMANHO_DO_TRECHO_COPIADO,
): boolean {
  const trechos = new Set<string>();
  for (const referencia of referencias) {
    const p = palavras(referencia);
    for (let i = 0; i + tamanho <= p.length; i++) trechos.add(p.slice(i, i + tamanho).join(" "));
  }
  if (trechos.size === 0) return false;
  const alvo = palavras(texto);
  for (let i = 0; i + tamanho <= alvo.length; i++) {
    if (trechos.has(alvo.slice(i, i + tamanho).join(" "))) return true;
  }
  return false;
}

/**
 * Uma fonte só vale se: (1) o identificador existe no material (proveniência), (2) o domínio é da
 * lista branca, (3) a data está nas últimas 36 horas e (4) o link responde. Veículos que
 * bloqueiam robôs (401/403/429) contam como "inconclusivo" e passam, porque a proveniência já
 * foi provada em (1). O endereço publicado é o FINAL, depois de redirecionamentos de veículo.
 */
async function avaliarFonte(
  id: string,
  registro: ReadonlyMap<string, ItemDeMaterial>,
  transporte: Transporte,
  agora: Date,
): Promise<Avaliacao> {
  const item = registro.get(id);
  if (!item) return { ok: false, motivo: `identificador ${id} não existe no material` };

  const host = hostDe(item.url);
  const permitido =
    host !== null &&
    (pertenceAoDominio(host, DOMINIOS_PERMITIDOS) ||
      pertenceAoDominio(host, DOMINIOS_DE_REDIRECIONAMENTO));
  if (!host || !permitido)
    return { ok: false, motivo: `${host ?? item.url} não está na lista branca` };

  if (!item.publicadoEm) return { ok: false, motivo: `${id} não tem data de publicação confiável` };
  const idadeHoras = (agora.getTime() - Date.parse(item.publicadoEm)) / UMA_HORA_MS;
  if (idadeHoras > JANELA_DE_NOTICIAS_HORAS) {
    return {
      ok: false,
      motivo: `${id} foi publicado há mais de ${JANELA_DE_NOTICIAS_HORAS} horas`,
    };
  }
  if (idadeHoras < -1) return { ok: false, motivo: `${id} tem data no futuro` };

  const { status, urlFinal } = await transporte.verificar(item.url);
  const hostFinal = hostDe(urlFinal) ?? host;
  const bloqueiaRobo =
    pertenceAoDominio(host, DOMINIOS_QUE_BLOQUEIAM_SCRIPT) ||
    pertenceAoDominio(hostFinal, DOMINIOS_QUE_BLOQUEIAM_SCRIPT);

  const respondeu = status >= 200 && status < 400;
  const inconclusivo = [401, 403, 429].includes(status) && bloqueiaRobo;
  if (!respondeu && !inconclusivo) {
    return {
      ok: false,
      motivo: `${item.url} respondeu ${status === 0 ? "sem resposta" : `HTTP ${status}`}`,
    };
  }
  if (respondeu && !pertenceAoDominio(hostFinal, DOMINIOS_PERMITIDOS)) {
    return {
      ok: false,
      motivo: `${item.url} redirecionou para ${hostFinal}, fora da lista branca`,
    };
  }

  const ehRedirecionador = pertenceAoDominio(host, DOMINIOS_DE_REDIRECIONAMENTO);
  const url = ehRedirecionador ? urlCanonica(urlFinal) : item.url;
  if (!url) return { ok: false, motivo: `${item.url} não tem URL final válida` };
  return { ok: true, fonte: { titulo: item.titulo, url, publicadoEm: item.publicadoEm } };
}

function processarNoticia(
  noticia: NoticiaRedigida,
  avaliacoes: ReadonlyMap<string, Avaliacao>,
  registro: ReadonlyMap<string, ItemDeMaterial>,
  descartes: Descarte[],
  onde: string,
): Noticia | null {
  const fontes: Fonte[] = [];
  const urls = new Set<string>();
  for (const id of noticia.fontes) {
    const avaliacao = avaliacoes.get(id);
    if (!avaliacao) continue;
    if (!avaliacao.ok) {
      descartes.push({ onde: `${onde} · fonte ${id}`, motivo: avaliacao.motivo });
      continue;
    }
    if (urls.has(avaliacao.fonte.url)) continue;
    urls.add(avaliacao.fonte.url);
    fontes.push(avaliacao.fonte);
  }
  if (fontes.length === 0) {
    descartes.push({ onde, motivo: "nenhuma fonte válida: notícia descartada" });
    return null;
  }

  const referencias = noticia.fontes.flatMap((id) => {
    const item = registro.get(id);
    return item ? [`${item.titulo}. ${item.resumo}`] : [];
  });
  if (temTrechoCopiado(`${noticia.oQueAconteceu} ${noticia.porQueImporta}`, referencias)) {
    descartes.push({ onde, motivo: "trecho copiado de uma matéria: notícia descartada" });
    return null;
  }

  return {
    titulo: noticia.titulo,
    oQueAconteceu: noticia.oQueAconteceu,
    porQueImporta: noticia.porQueImporta,
    lados: noticia.lados,
    continuaDeOntem: noticia.continuaDeOntem,
    fontes,
  };
}

export interface DependenciasDaVerificacao {
  transporte: Transporte;
  relogio: Relogio;
  log: Logger;
}

/** Passo 5 (sem IA): confere cada fonte e monta as seções que sobrevivem. */
export async function verificarRedacao(
  deps: DependenciasDaVerificacao,
  redacao: Redacao,
  registro: ReadonlyMap<string, ItemDeMaterial>,
): Promise<ResultadoDaVerificacao> {
  const { transporte, relogio, log } = deps;
  const agora = relogio.agora();

  if (redacao.emTrintaSegundos.filter((frase) => frase.trim() !== "").length !== 3) {
    throw new ErroDeVerificacao('"emTrintaSegundos" precisa ter exatamente 3 frases não vazias.');
  }

  const noticias = [
    ...redacao.secoes.flatMap((s) => s.noticias),
    ...(redacao.curiosidade ? [redacao.curiosidade] : []),
  ];
  const ids = [...new Set(noticias.flatMap((n) => n.fontes))];
  const resultados = await emParalelo(ids, CONCORRENCIA_HTTP, (id) =>
    avaliarFonte(id, registro, transporte, agora),
  );
  const avaliacoes = new Map(ids.map((id, i) => [id, resultados[i] as Avaliacao]));

  const descartes: Descarte[] = [];
  // Seção repetida pelo redator: junta as notícias na primeira.
  const secoesPorId = new Map<string, Noticia[]>();
  const importanciaDe = new WeakMap<Noticia, number>();
  const ordemDe = new WeakMap<Noticia, number>();
  let ordem = 0;
  for (const secao of redacao.secoes) {
    const lista = secoesPorId.get(secao.id) ?? [];
    secao.noticias.forEach((noticia, i) => {
      const onde = `${secao.id} #${i + 1} "${noticia.titulo}"`;
      const valida = processarNoticia(noticia, avaliacoes, registro, descartes, onde);
      if (valida) {
        lista.push(valida);
        importanciaDe.set(valida, Math.min(5, Math.max(1, Math.round(noticia.importancia))));
        ordemDe.set(valida, ordem++);
      }
    });
    secoesPorId.set(secao.id, lista);
  }

  // Limites do contrato: no máximo 4 por seção e o teto global. O corte tira primeiro as de menor
  // importância (nota do redator); em empate, a que vem mais tarde.
  const removerMenosImportante = (
    candidatas: { id: string; noticia: Noticia }[],
    motivo: string,
  ) => {
    const [pior] = [...candidatas].sort(
      (a, b) =>
        (importanciaDe.get(a.noticia) ?? 3) - (importanciaDe.get(b.noticia) ?? 3) ||
        (ordemDe.get(b.noticia) ?? 0) - (ordemDe.get(a.noticia) ?? 0),
    );
    if (!pior) return;
    const lista = secoesPorId.get(pior.id) ?? [];
    lista.splice(lista.indexOf(pior.noticia), 1);
    descartes.push({ onde: `${pior.id} "${pior.noticia.titulo}"`, motivo });
  };
  for (const [id, lista] of secoesPorId) {
    while (lista.length > NOTICIAS_MAX_POR_SECAO) {
      removerMenosImportante(
        lista.map((noticia) => ({ id, noticia })),
        "acima do máximo de notícias por seção",
      );
    }
  }
  const todas = () =>
    [...secoesPorId.entries()].flatMap(([id, lista]) => lista.map((noticia) => ({ id, noticia })));
  while (todas().length > TETO_NOTICIAS) {
    removerMenosImportante(todas(), `acima do teto de ${TETO_NOTICIAS} notícias`);
  }

  const secoes: Secao[] = [...secoesPorId.entries()]
    .filter(([, lista]) => lista.length > 0)
    .map(([id, lista]) => ({ id: id as Secao["id"], noticias: lista }));
  if (secoes.length === 0) {
    throw new ErroDeVerificacao(
      `Nenhuma notícia sobreviveu à verificação de fontes. Motivos: ${descartes
        .slice(0, 6)
        .map((d) => d.motivo)
        .join("; ")}`,
    );
  }

  const curiosidade = redacao.curiosidade
    ? processarNoticia(redacao.curiosidade, avaliacoes, registro, descartes, "curiosidade")
    : null;

  const fontesVerificadas = [...avaliacoes.values()].filter((a) => a.ok).length;
  const fontesRecusadas = avaliacoes.size - fontesVerificadas;
  log.info(
    `Verificação: ${fontesVerificadas}/${avaliacoes.size} fontes aprovadas; ` +
      `${secoes.reduce((soma, s) => soma + s.noticias.length, 0)} notícias mantidas, ${descartes.length} descartes.`,
  );
  return { secoes, curiosidade, descartes, fontesVerificadas, fontesRecusadas };
}
