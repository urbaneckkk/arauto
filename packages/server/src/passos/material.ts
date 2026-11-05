import type { ItemColetado, ResultadoDaColeta } from "../coleta/tipos.js";
import type { Perfil } from "../config/env.js";
import type { RegistroDeBriefing } from "../repo/repositorio.js";
import { dataPorExtenso, formatarDataHora } from "../util/tempo.js";
import { cortar } from "../util/texto.js";
import type { ResultadoDaApuracao } from "./apuracao.js";
import type { ClusterPontuado, ResultadoDoTermometro } from "./termometro.js";

const ITENS_POR_ACONTECIMENTO = 3;
const SECOES_COM_MAIS_ESPACO = new Set(["mundo"]);

/** Até `quantos` itens, priorizando veículos diferentes e os mais recentes. */
export function escolherItens(itens: readonly ItemColetado[], quantos: number): ItemColetado[] {
  const recentes = [...itens].sort((a, b) => b.publicadoEm.localeCompare(a.publicadoEm));
  const escolhidos: ItemColetado[] = [];
  const veiculos = new Set<string>();
  for (const item of recentes) {
    if (escolhidos.length >= quantos) break;
    if (veiculos.has(item.veiculo)) continue;
    veiculos.add(item.veiculo);
    escolhidos.push(item);
  }
  for (const item of recentes) {
    if (escolhidos.length >= quantos) break;
    if (!escolhidos.includes(item)) escolhidos.push(item);
  }
  return escolhidos;
}

function linhaDeItem(item: ItemColetado): string {
  const resumo = item.resumo ? ` — ${cortar(item.resumo, 220)}` : "";
  return `[${item.id}] ${item.veiculo} · ${formatarDataHora(item.publicadoEm)} · ${item.titulo}${resumo}`;
}

function blocoDeAcontecimento(cluster: ClusterPontuado): string {
  const itens = escolherItens(cluster.itens, ITENS_POR_ACONTECIMENTO);
  return [
    `Acontecimento (${cluster.veiculos} veículos): ${cluster.titulo}`,
    ...itens.map((item) => `- ${linhaDeItem(item)}`),
  ].join("\n");
}

export interface EntradaDoMaterial {
  agora: Date;
  termometro: ResultadoDoTermometro;
  coleta: ResultadoDaColeta;
  apuracao: ResultadoDaApuracao | null;
  ontem: RegistroDeBriefing | null;
  perfil: Perfil;
}

/**
 * Tudo que o redator pode usar, em um só texto. É o material de verdade: "o que não estiver
 * nele não entra". Os itens são citados por identificador, nunca por URL.
 */
export function montarMaterial(entrada: EntradaDoMaterial): string {
  const { agora, termometro, coleta, apuracao, ontem, perfil } = entrada;
  const partes: string[] = [];

  partes.push(`# Material para o briefing de ${dataPorExtenso(agora)} (Curitiba)`);

  partes.push("## História do dia (a mais comentada)");
  partes.push(
    [
      `${termometro.historiaDoDia.titulo} (${termometro.historiaDoDia.veiculos} veículos, ${termometro.historiaDoDia.paises} países)`,
      ...escolherItens(termometro.historiaDoDia.itens, 5).map((item) => `- ${linhaDeItem(item)}`),
    ].join("\n"),
  );

  partes.push("## Tempo em Curitiba (valores oficiais; entram no briefing pelo sistema)");
  if (coleta.tempo) {
    const t = coleta.tempo;
    partes.push(
      `Mínima ${t.minC} °C, máxima ${t.maxC} °C, chance de chuva ${t.chuvaPct}% (${t.chuvaMm} mm), ${t.descricaoDoTempo}.`,
    );
  } else {
    partes.push(
      "A previsão do tempo está indisponível hoje. Diga isso no resumo, sem inventar números.",
    );
  }
  if (coleta.alertas.length > 0) {
    partes.push("Alertas do INMET para Curitiba:");
    for (const alerta of coleta.alertas) {
      partes.push(
        `- ${alerta.nivel.toUpperCase()} · ${alerta.tipo} · de ${formatarDataHora(alerta.inicio)} a ${formatarDataHora(alerta.fim)}` +
          (alerta.riscos[0] ? ` · risco: ${cortar(alerta.riscos[0], 200)}` : "") +
          (alerta.instrucoes[0] ? ` · orientação: ${cortar(alerta.instrucoes[0], 160)}` : ""),
      );
    }
  } else {
    partes.push("Sem alertas do INMET para Curitiba.");
  }

  partes.push("## Acontecimentos por seção");
  const secoes = [...new Set(termometro.clusters.map((c) => c.categoria))].filter(
    (categoria) => categoria !== "descartar",
  );
  for (const secao of secoes) {
    const limite = perfil.candidatosPorSecao + (SECAO_COM_MAIS_ESPACO(secao) ? 2 : 0);
    const candidatos = termometro.clusters.filter((c) => c.categoria === secao).slice(0, limite);
    partes.push(`### ${secao}`);
    partes.push(candidatos.map(blocoDeAcontecimento).join("\n\n"));
  }

  partes.push("## Notas da apuração (busca na web)");
  partes.push(
    apuracao
      ? apuracao.texto || "(a apuração não trouxe notas)"
      : "(A apuração por busca não está disponível hoje: use só o material dos veículos acima.)",
  );
  if (apuracao && apuracao.itens.length > 0) {
    partes.push("Fontes encontradas na busca:");
    for (const item of apuracao.itens) {
      partes.push(
        `- [${item.id}] ${item.veiculo} · ${item.publicadoEm ? formatarDataHora(item.publicadoEm) : "sem data"} · ${item.titulo}`,
      );
    }
  }

  partes.push("## Ontem (para o campo continuaDeOntem)");
  if (ontem) {
    const titulos = ontem.briefing.secoes.flatMap((secao) => secao.noticias.map((n) => n.titulo));
    partes.push(`Briefing de ${ontem.briefing.data}:`);
    partes.push(titulos.map((titulo) => `- ${titulo}`).join("\n"));
  } else {
    partes.push("(não há briefing anterior)");
  }

  return partes.join("\n\n");
}

function SECAO_COM_MAIS_ESPACO(secao: string): boolean {
  return SECOES_COM_MAIS_ESPACO.has(secao);
}
