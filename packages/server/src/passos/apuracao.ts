import { SECAO_IDS } from "@arauto/core";
import type { AlertaDoInmet } from "../coleta/tipos.js";
import { DOMINIOS_DE_REDIRECIONAMENTO, DOMINIOS_PERMITIDOS } from "../config/dominios.js";
import type { Perfil } from "../config/env.js";
import { lerPrompt } from "../config/prompts.js";
import type { Logger } from "../infra/log.js";
import type { ClienteDeModelo } from "../modelos/cliente.js";
import { dataEmSaoPaulo, lerIdadeDaPagina, type Relogio } from "../util/tempo.js";
import { cortar } from "../util/texto.js";
import { hostDe, pertenceAoDominio, urlCanonica } from "../util/url.js";
import type { ResultadoDoTermometro } from "./termometro.js";
import type { ItemDeMaterial } from "./tipos.js";

export interface ResultadoDaApuracao {
  /** Notas do apurador, com as URLs trocadas por identificadores [wNN] ou marcadas como não verificadas. */
  texto: string;
  /** Achados da busca, citáveis pelo redator (ids w01...). */
  itens: ItemDeMaterial[];
  buscas: number;
  temasFracos: string[];
}

export interface DependenciasDaApuracao {
  cliente: ClienteDeModelo;
  relogio: Relogio;
  log: Logger;
  modelo: string;
  perfil: Perfil;
}

const TEMAS_FRACOS_MAX = 4;

/** Seções com menos de 2 acontecimentos no material: candidatas à busca (briefing, passo 3). */
export function temasFracos(termometro: ResultadoDoTermometro): string[] {
  const contagem = new Map<string, number>();
  for (const cluster of termometro.clusters) {
    if (cluster.categoria === "descartar") continue;
    contagem.set(cluster.categoria, (contagem.get(cluster.categoria) ?? 0) + 1);
  }
  return [...SECAO_IDS, "curiosidade"]
    .filter((tema) => (contagem.get(tema) ?? 0) < 2)
    .slice(0, TEMAS_FRACOS_MAX);
}

const REGEX_URL = /https?:\/\/[^\s)\]>"'<]+/g;

/**
 * Troca cada URL das notas pelo identificador do achado da busca (se a URL realmente apareceu
 * nos resultados) ou por "[sem fonte verificada]". URL que só existe na resposta do modelo
 * nunca vira fonte: é a proteção contra link inventado.
 */
export function trocarUrlsPorIds(texto: string, idPorUrl: ReadonlyMap<string, string>): string {
  return texto.replace(REGEX_URL, (bruta) => {
    const limpa = bruta.replace(/[.,;:!?]+$/, "");
    const canonica = urlCanonica(limpa);
    const id = canonica ? idPorUrl.get(canonica) : undefined;
    return id ? `[${id}]` : "[sem fonte verificada]";
  });
}

export async function executarApuracao(
  deps: DependenciasDaApuracao,
  termometro: ResultadoDoTermometro,
  alertas: readonly AlertaDoInmet[],
): Promise<ResultadoDaApuracao> {
  const { cliente, relogio, log, modelo, perfil } = deps;
  const agora = relogio.agora();
  const fracos = temasFracos(termometro);
  const historia = termometro.historiaDoDia;

  const usuario = [
    `Data: ${dataEmSaoPaulo(agora)} (Curitiba)`,
    "",
    "## História do dia a confirmar",
    historia.titulo,
    ...historia.itens.slice(0, 5).map((item) => `- ${item.veiculo}: ${item.titulo}`),
    "",
    "## Temas com pouca cobertura no material (procure 1 notícia recente de cada)",
    fracos.length > 0 ? fracos.join(", ") : "(nenhum)",
    "",
    "## Alertas oficiais do INMET já conhecidos para Curitiba",
    alertas.length > 0
      ? alertas.map((a) => `- ${a.nivel}: ${a.tipo} (${a.quando})`).join("\n")
      : "(nenhum)",
    "",
    `Limite: até ${perfil.maxBuscas} buscas.`,
  ].join("\n");

  const resposta = await cliente.chamar({
    passo: "apuracao",
    modelo,
    sistema: lerPrompt("apuracao"),
    usuario,
    maxTokens: 4_000,
    esforco: perfil.esforcoApuracao,
    busca: { maxBuscas: perfil.maxBuscas, dominios: DOMINIOS_PERMITIDOS },
  });

  // Registro dos achados: só domínio permitido, sem repetir URL.
  const itens: ItemDeMaterial[] = [];
  const idPorUrl = new Map<string, string>();
  for (const achado of resposta.resultadosDeBusca) {
    const url = urlCanonica(achado.url);
    const host = url ? hostDe(url) : null;
    if (!url || !host || idPorUrl.has(url)) continue;
    const permitido =
      pertenceAoDominio(host, DOMINIOS_PERMITIDOS) ||
      pertenceAoDominio(host, DOMINIOS_DE_REDIRECIONAMENTO);
    if (!permitido) continue;
    const id = `w${String(itens.length + 1).padStart(2, "0")}`;
    idPorUrl.set(url, id);
    itens.push({
      id,
      feedId: "busca",
      veiculo: host.replace(/^www\./, ""),
      pais: "—",
      idioma: "pt",
      titulo: cortar(achado.titulo, 200),
      url,
      publicadoEm: lerIdadeDaPagina(achado.idade, agora),
      resumo: "",
      origem: "busca",
    });
  }

  log.info(`Apuração: ${resposta.uso.buscas} buscas, ${itens.length} achados citáveis.`);
  return {
    texto: trocarUrlsPorIds(resposta.texto, idPorUrl),
    itens,
    buscas: resposta.uso.buscas,
    temasFracos: fracos,
  };
}
