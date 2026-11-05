import { AlertaSchema, type Briefing, BriefingSchema, type TemaEscolhido } from "@arauto/core";
import type { ResultadoDaColeta } from "../coleta/tipos.js";
import type { Redacao } from "./redacao.js";
import type { ClusterPontuado } from "./termometro.js";
import { ErroDeVerificacao, type ResultadoDaVerificacao } from "./verificacao.js";

export interface EntradaDaMontagem {
  data: string;
  historia: ClusterPontuado;
  redacao: Redacao;
  verificado: ResultadoDaVerificacao;
  tema: TemaEscolhido;
  coleta: ResultadoDaColeta;
  custo: { usd: number; buscas: number };
}

/**
 * Passo 7 (parte 1): junta o que veio do modelo (texto) com o que veio de fontes oficiais
 * (números do tempo e alertas) e valida tudo com o esquema do contrato. Número do tempo
 * e alerta NUNCA passam pelo modelo: só o resumo em texto.
 */
export function montarBriefing(entrada: EntradaDaMontagem): Briefing {
  const { data, historia, redacao, verificado, tema, coleta, custo } = entrada;
  const previsao = coleta.tempo;

  const bruto = {
    data,
    historiaDoDia: {
      titulo: redacao.historiaDoDia.titulo,
      resumo: redacao.historiaDoDia.resumo,
      veiculos: historia.veiculos,
      paises: historia.paises,
      pontuacao: historia.pontuacao,
      pontuacaoParcial: historia.pontuacaoParcial,
    },
    tema,
    emTrintaSegundos: redacao.emTrintaSegundos,
    tempo: {
      minC: previsao?.minC ?? null,
      maxC: previsao?.maxC ?? null,
      chuvaPct: previsao?.chuvaPct ?? null,
      resumo: redacao.tempoResumo,
      // Só os campos do contrato: riscos, instruções e "quando" ficam de fora.
      alertas: coleta.alertas.map((alerta) => AlertaSchema.parse(alerta)),
    },
    secoes: verificado.secoes,
    curiosidade: verificado.curiosidade,
    custo,
  };

  const resultado = BriefingSchema.safeParse(bruto);
  if (!resultado.success) {
    const problemas = resultado.error.issues
      .slice(0, 6)
      .map((p) => `${p.path.join(".") || "(raiz)"}: ${p.message}`)
      .join("; ");
    throw new ErroDeVerificacao(`O briefing montado não obedece ao contrato: ${problemas}`);
  }
  return resultado.data;
}
