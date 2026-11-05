// Transforma o estado do pipeline (estado.json) nos arquivos que o site lê:
//   briefing/<data>.json   o briefing de cada dia (última versão)
//   briefing/ultimo.json   o mais recente
//   briefing/indice.json   lista dos últimos dias (data, manchete, tema)
// E, com --podar, tira do estado o que NÃO deve ficar numa branch pública: a saída crua dos passos
// (títulos e resumos de notícias coletados, que têm direitos autorais) e execuções antigas.
//
// Uso: node scripts/exportar-site.mjs --estado dados/estado.json --saida packages/web/public/briefing [--dias 30] [--podar]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const DIAS_PADRAO = 30;
const EXECUCOES_GUARDADAS = 7;
const DIAS_DE_BRIEFINGS_GUARDADOS = 60;
const DIAS_DE_GASTOS_GUARDADOS = 62;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Última versão de cada data, da mais nova para a mais antiga, limitada a `dias` datas. */
export function ultimasVersoes(briefings, dias = DIAS_PADRAO) {
  const porData = new Map();
  for (const registro of briefings) {
    if (!DATA.test(registro?.data ?? "") || !registro.briefing) continue;
    const atual = porData.get(registro.data);
    if (!atual || registro.versao > atual.versao) porData.set(registro.data, registro);
  }
  return [...porData.values()].sort((a, b) => b.data.localeCompare(a.data)).slice(0, dias);
}

/** Só o que o site precisa. Nada de id de execução, custo por passo ou texto bruto. */
export function registroPublico(registro) {
  return {
    data: registro.data,
    versao: registro.versao,
    criadoEm: registro.criadoEm,
    briefing: registro.briefing,
    avisos: registro.avisos ?? [],
  };
}

export function montarSite(estado, dias = DIAS_PADRAO) {
  const versoes = ultimasVersoes(estado.briefings ?? [], dias);
  const arquivos = new Map();
  for (const registro of versoes) {
    arquivos.set(`${registro.data}.json`, registroPublico(registro));
  }
  const maisNovo = versoes[0];
  if (maisNovo) arquivos.set("ultimo.json", registroPublico(maisNovo));
  arquivos.set(
    "indice.json",
    versoes.map((r) => ({
      data: r.data,
      titulo: r.briefing.historiaDoDia.titulo,
      tema: r.briefing.tema.id,
      versao: r.versao,
    })),
  );
  return arquivos;
}

/**
 * Estado para guardar na branch pública, para ela não crescer sem fim:
 *  - execuções: só as 7 últimas, sem o conteúdo dos passos (texto coletado tem direitos autorais);
 *  - briefings: a última versão de cada um dos últimos 60 dias;
 *  - gastos: só os últimos 62 dias (a trava mensal só precisa do mês corrente).
 */
export function podarEstado(estado, agora = new Date()) {
  const execucoes = [...(estado.execucoes ?? [])]
    .sort((a, b) => b.criadaEm.localeCompare(a.criadaEm))
    .slice(0, EXECUCOES_GUARDADAS)
    .map((execucao) => ({
      ...execucao,
      passos: (execucao.passos ?? []).map((passo) => ({ ...passo, saida: null })),
    }));
  const corte = agora.getTime() - DIAS_DE_GASTOS_GUARDADOS * 86_400_000;
  return {
    ...estado,
    execucoes,
    briefings: ultimasVersoes(estado.briefings ?? [], DIAS_DE_BRIEFINGS_GUARDADOS),
    usos: (estado.usos ?? []).filter((linha) => Date.parse(linha.quando) >= corte),
  };
}

function main() {
  const { values } = parseArgs({
    options: {
      estado: { type: "string" },
      saida: { type: "string" },
      dias: { type: "string" },
      podar: { type: "boolean" },
    },
  });
  if (!values.estado || !values.saida) {
    console.error(
      "Uso: node scripts/exportar-site.mjs --estado <estado.json> --saida <pasta> [--dias 30] [--podar]",
    );
    process.exit(1);
  }
  const estado = JSON.parse(readFileSync(values.estado, "utf8"));
  const dias = values.dias ? Number(values.dias) : DIAS_PADRAO;
  if (!Number.isInteger(dias) || dias < 1)
    throw new Error("--dias precisa ser um número inteiro maior que 0");

  const arquivos = montarSite(estado, dias);
  rmSync(values.saida, { recursive: true, force: true });
  mkdirSync(values.saida, { recursive: true });
  for (const [nome, conteudo] of arquivos) {
    writeFileSync(join(values.saida, nome), `${JSON.stringify(conteudo)}\n`, "utf8");
  }
  console.log(
    `Site: ${arquivos.size} arquivos em ${values.saida} (${arquivos.get("indice.json").length} dias).`,
  );
  if (!arquivos.has("ultimo.json")) console.log("Aviso: ainda não há nenhum briefing no estado.");

  if (values.podar) {
    writeFileSync(values.estado, `${JSON.stringify(podarEstado(estado), null, 1)}\n`, "utf8");
    console.log("Estado podado (sem texto coletado, 7 execuções).");
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
