import type { Passo } from "@arauto/core";
import { calcularUsd } from "../custo/precos.js";
import type { BuscaWeb, ChamadaDeModelo, ClienteDeModelo, RespostaDoModelo } from "./cliente.js";

export interface OpcoesDaResposta {
  motivoDeParada?: string;
  resultadosDeBusca?: BuscaWeb[];
  tokensEntrada?: number;
  tokensSaida?: number;
  buscas?: number;
}

/** Monta uma resposta de modelo com uso e custo coerentes com a tabela de preços. */
export function respostaDeTexto(
  modelo: string,
  texto: string,
  {
    motivoDeParada = "end_turn",
    resultadosDeBusca = [],
    tokensEntrada = 1000,
    tokensSaida = 500,
    buscas = 0,
  }: OpcoesDaResposta = {},
): RespostaDoModelo {
  const bruto = { tokensEntrada, tokensSaida, tokensCacheLeitura: 0, buscas };
  return {
    texto,
    resultadosDeBusca,
    motivoDeParada,
    uso: { modelo, ...bruto, usd: calcularUsd(modelo, bruto) },
  };
}

type Roteiro = RespostaDoModelo | Error | ((chamada: ChamadaDeModelo) => RespostaDoModelo);

/**
 * Cliente de mentira para testes: cada passo tem uma fila de respostas, consumida na ordem.
 * Chamada sem resposta no roteiro é erro de teste, nunca um valor inventado.
 */
export class ClienteFalso implements ClienteDeModelo {
  readonly chamadas: ChamadaDeModelo[] = [];
  private readonly filas = new Map<Passo, Roteiro[]>();

  constructor(roteiro: Partial<Record<Passo, Roteiro | Roteiro[]>> = {}) {
    for (const [passo, valor] of Object.entries(roteiro) as [Passo, Roteiro | Roteiro[]][]) {
      this.filas.set(passo, Array.isArray(valor) ? [...valor] : [valor]);
    }
  }

  async chamar(chamada: ChamadaDeModelo): Promise<RespostaDoModelo> {
    this.chamadas.push(chamada);
    const fila = this.filas.get(chamada.passo);
    // A última resposta da fila se repete, para testar tentativas repetidas.
    const proximo = fila && fila.length > 1 ? fila.shift() : fila?.[0];
    if (proximo === undefined) {
      throw new Error(`ClienteFalso: sem resposta de teste para o passo "${chamada.passo}"`);
    }
    if (proximo instanceof Error) throw proximo;
    return typeof proximo === "function" ? proximo(chamada) : proximo;
  }
}
