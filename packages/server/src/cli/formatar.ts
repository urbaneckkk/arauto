import type { Noticia } from "@arauto/core";
import { medirLeitura } from "../passos/leitura.js";
import type { RegistroDeBriefing } from "../repo/repositorio.js";
import { formatarDataHora } from "../util/tempo.js";

const dataBr = (iso: string) => iso.split("-").reverse().join("/");

function formatarNoticia(noticia: Noticia): string[] {
  const linhas = [
    `  • ${noticia.titulo}`,
    `    O que aconteceu: ${noticia.oQueAconteceu}`,
    `    Por que importa: ${noticia.porQueImporta}`,
  ];
  for (const lado of noticia.lados) linhas.push(`    Lado — ${lado.quem}: ${lado.posicao}`);
  if (noticia.continuaDeOntem) linhas.push(`    ↻ Continua de ontem: ${noticia.continuaDeOntem}`);
  for (const fonte of noticia.fontes) {
    linhas.push(`    ↗ ${fonte.titulo} (${formatarDataHora(fonte.publicadoEm)})`);
    linhas.push(`      ${fonte.url}`);
  }
  return linhas;
}

/** Briefing legível no terminal (comando `brief:ver`). Se não for de hoje, avisa com clareza. */
export function formatarBriefing(registro: RegistroDeBriefing, opcoes: { hoje: string }): string {
  const { briefing } = registro;
  const leitura = medirLeitura(briefing);
  const linhas: string[] = [];

  linhas.push(`══ ARAUTO · briefing de ${dataBr(briefing.data)} (versão ${registro.versao}) ══`);
  if (briefing.data !== opcoes.hoje) {
    linhas.push(
      `⚠ Não há briefing de hoje (${dataBr(opcoes.hoje)}). Este é o último disponível, de ${dataBr(briefing.data)}.`,
    );
  }
  linhas.push("");
  linhas.push(
    `Tema: ${briefing.tema.id} (intensidade ${briefing.tema.intensidade}, confiança ${briefing.tema.confianca})`,
  );
  linhas.push(`  ${briefing.tema.motivo}`);
  linhas.push(
    `  Aviso: "${briefing.tema.notificacao.titulo}" — ${briefing.tema.notificacao.corpo}`,
  );

  linhas.push("", "EM 30 SEGUNDOS");
  for (const [i, frase] of briefing.emTrintaSegundos.entries()) linhas.push(`  ${i + 1}. ${frase}`);

  const { tempo } = briefing;
  linhas.push("", "TEMPO EM CURITIBA");
  linhas.push(
    tempo.minC !== null && tempo.maxC !== null
      ? `  ${tempo.minC}–${tempo.maxC} °C · chance de chuva ${tempo.chuvaPct ?? "?"}%`
      : "  Previsão indisponível",
  );
  linhas.push(`  ${tempo.resumo}`);
  for (const alerta of tempo.alertas) {
    linhas.push(
      `  ⚠ ${alerta.nivel.toUpperCase()} · ${alerta.tipo} · ${formatarDataHora(alerta.inicio)} → ${formatarDataHora(alerta.fim)} (${alerta.fonte})`,
    );
  }

  const historia = briefing.historiaDoDia;
  linhas.push("", `HISTÓRIA DO DIA — ${historia.titulo}`);
  linhas.push(`  ${historia.resumo}`);
  linhas.push(
    `  pontuação ${historia.pontuacao}${historia.pontuacaoParcial ? " (parcial: sem GDELT)" : ""} · ${historia.veiculos} veículos · ${historia.paises} países`,
  );

  for (const secao of briefing.secoes) {
    linhas.push("", `## ${secao.id}`);
    for (const noticia of secao.noticias) linhas.push(...formatarNoticia(noticia), "");
    linhas.pop();
  }
  if (briefing.curiosidade) {
    linhas.push("", "## curiosidade", ...formatarNoticia(briefing.curiosidade));
  }

  const totalDeFontes = [
    ...briefing.secoes.flatMap((s) => s.noticias),
    ...(briefing.curiosidade ? [briefing.curiosidade] : []),
  ].reduce((soma, n) => soma + n.fontes.length, 0);
  linhas.push("", "──────────────────────────────────────────");
  linhas.push(
    `Leitura: ${leitura.palavras} palavras ≈ ${leitura.minutos} min (alvo: 5 a 7) · ${totalDeFontes} fontes`,
  );
  linhas.push(`Custo: US$ ${briefing.custo.usd.toFixed(4)} · ${briefing.custo.buscas} buscas`);
  if (registro.avisos.length > 0) {
    linhas.push("Avisos de qualidade:");
    for (const aviso of registro.avisos) linhas.push(`  - ${aviso}`);
  }
  return linhas.join("\n");
}
