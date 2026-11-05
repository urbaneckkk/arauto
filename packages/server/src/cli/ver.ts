import { parseArgs } from "node:util";
import { DOMINIOS_QUE_BLOQUEIAM_SCRIPT } from "../config/dominios.js";
import { lerEnv } from "../config/env.js";
import { TransporteReal } from "../infra/transporte.js";
import { emParalelo } from "../util/paralelo.js";
import { dataEmSaoPaulo, relogioReal } from "../util/tempo.js";
import { hostDe, pertenceAoDominio } from "../util/url.js";
import { abrirRepositorio } from "./ambiente.js";
import { formatarBriefing } from "./formatar.js";

const AJUDA = `Uso: pnpm brief:ver [opções]

Mostra o último briefing (ou o de uma data). Se não houver briefing de hoje, mostra o mais recente com um aviso claro.

Opções:
  --data AAAA-MM-DD  mostra o briefing de uma data
  --json             imprime o briefing em JSON
  --passos           mostra os passos da última execução (para depurar)
  --links            reabre agora cada fonte do briefing e confere a idade (aceite: links abrindo, até 36 h)
  --sem-banco        lê do arquivo local, sem Postgres
  --ajuda            mostra esta mensagem`;

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      data: { type: "string" },
      json: { type: "boolean" },
      passos: { type: "boolean" },
      links: { type: "boolean" },
      "sem-banco": { type: "boolean" },
      ajuda: { type: "boolean" },
    },
    allowPositionals: false,
  });
  if (values.ajuda) {
    console.log(AJUDA);
    return 0;
  }

  const env = lerEnv();
  const aberto = await abrirRepositorio(values["sem-banco"] === true, env);
  try {
    if (values.passos) {
      const execucao = await aberto.repo.ultimaExecucao();
      if (!execucao) {
        console.log("Nenhuma execução registrada ainda.");
        return 1;
      }
      console.log(
        `Execução ${execucao.id} · ${execucao.data} · ${execucao.tipo} · ${execucao.status}`,
      );
      for (const p of execucao.passos) {
        const custo = p.usos.reduce((soma, uso) => soma + uso.usd, 0);
        console.log(
          `  ${p.status === "ok" ? "✔" : "✖"} ${p.passo.padEnd(12)} tentativa ${p.tentativa} · ${p.resumoEntrada} · US$ ${custo.toFixed(4)}${p.erro ? ` · ERRO: ${p.erro}` : ""}`,
        );
      }
      return 0;
    }

    const registro = values.data
      ? await aberto.repo.briefingDaData(values.data)
      : await aberto.repo.ultimoBriefing();
    if (!registro) {
      console.log(
        values.data
          ? `Não há briefing de ${values.data}.`
          : "Ainda não há nenhum briefing. Rode: pnpm brief:gerar",
      );
      return 1;
    }
    if (values.links) {
      const transporte = new TransporteReal();
      const noticias = [
        ...registro.briefing.secoes.flatMap((secao) => secao.noticias),
        ...(registro.briefing.curiosidade ? [registro.briefing.curiosidade] : []),
      ];
      const fontes = [
        ...new Map(noticias.flatMap((n) => n.fontes).map((f) => [f.url, f])).values(),
      ];
      const criadoEm = Date.parse(registro.criadoEm);
      console.log(`Conferindo ${fontes.length} fontes do briefing de ${registro.briefing.data}...
`);
      const resultados = await emParalelo(fontes, 6, async (fonte) => {
        const { status } = await transporte.verificar(fonte.url);
        const horas = (criadoEm - Date.parse(fonte.publicadoEm)) / 3_600_000;
        const host = hostDe(fonte.url) ?? "";
        const bloqueia = pertenceAoDominio(host, DOMINIOS_QUE_BLOQUEIAM_SCRIPT);
        const abre = status >= 200 && status < 400;
        const inconclusivo = !abre && [401, 403, 429].includes(status) && bloqueia;
        const idadeOk = horas <= 36;
        return { fonte, status, horas, abre, inconclusivo, idadeOk };
      });
      for (const r of resultados) {
        const marca = r.abre && r.idadeOk ? "✔" : r.inconclusivo && r.idadeOk ? "?" : "✖";
        console.log(
          `${marca} HTTP ${String(r.status).padEnd(3)} · ${r.horas.toFixed(1).padStart(5)} h na publicação · ${r.fonte.url}${r.inconclusivo ? "  (o veículo bloqueia robôs; abra no navegador)" : ""}`,
        );
      }
      const ruins = resultados.filter((r) => !r.idadeOk || (!r.abre && !r.inconclusivo));
      const duvidosos = resultados.filter((r) => r.inconclusivo && r.idadeOk);
      console.log(
        `
${resultados.length - ruins.length - duvidosos.length} abrem e estão dentro de 36 h · ${duvidosos.length} a conferir no navegador · ${ruins.length} com problema`,
      );
      return ruins.length === 0 ? 0 : 1;
    }
    if (values.json) {
      console.log(JSON.stringify(registro.briefing, null, 2));
    } else {
      console.log(formatarBriefing(registro, { hoje: dataEmSaoPaulo(relogioReal.agora()) }));
    }
    return 0;
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
