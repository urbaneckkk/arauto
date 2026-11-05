import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { calcularUsd } from "../custo/precos.js";
import type { BuscaWeb, ChamadaDeModelo, ClienteDeModelo, RespostaDoModelo } from "./cliente.js";

/** Quantas vezes se retoma uma resposta pausada pela busca web (pause_turn). */
const MAX_RETOMADAS = 3;

/**
 * Cliente real da API da Anthropic. A chave vem do ambiente e nunca é registrada em log.
 *
 * - Sonnet 5.5 e Haiku 5.5: o raciocínio vem ligado por padrão e `temperature` não pode mudar,
 *   então só se define `effort` (documentação do modelo, 04/11/2026).
 * - JSON vem por saída estruturada (`output_config.format`); `tool_choice` forçado dá erro 400.
 * - Busca web: `web_search_20260209`, com `max_uses` e `allowed_domains`.
 */
export class ClienteAnthropic implements ClienteDeModelo {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 5 * 60_000 });
  }

  async chamar(chamada: ChamadaDeModelo): Promise<RespostaDoModelo> {
    const mensagens: Anthropic.MessageParam[] = [{ role: "user", content: chamada.usuario }];
    const resultados: BuscaWeb[] = [];
    const textos: string[] = [];
    let tokensEntrada = 0;
    let tokensSaida = 0;
    let tokensCacheLeitura = 0;
    let buscas = 0;
    let motivoDeParada = "end_turn";

    for (let rodada = 0; rodada <= MAX_RETOMADAS; rodada++) {
      const resposta = await this.client.messages.create({
        model: chamada.modelo,
        max_tokens: chamada.maxTokens,
        system: chamada.sistema,
        messages: mensagens,
        output_config: {
          effort: chamada.esforco,
          ...(chamada.formato ? { format: zodOutputFormat(chamada.formato) } : {}),
        },
        ...(chamada.busca
          ? {
              tools: [
                {
                  type: "web_search_20260209" as const,
                  name: "web_search" as const,
                  max_uses: chamada.busca.maxBuscas,
                  allowed_domains: [...chamada.busca.dominios],
                  user_location: {
                    type: "approximate" as const,
                    city: "Curitiba",
                    region: "Paraná",
                    country: "BR",
                    timezone: "America/Sao_Paulo",
                  },
                },
              ],
            }
          : {}),
      });

      tokensEntrada += resposta.usage.input_tokens;
      tokensSaida += resposta.usage.output_tokens;
      tokensCacheLeitura += resposta.usage.cache_read_input_tokens ?? 0;
      buscas += resposta.usage.server_tool_use?.web_search_requests ?? 0;

      for (const bloco of resposta.content) {
        if (bloco.type === "text") textos.push(bloco.text);
        if (bloco.type === "web_search_tool_result" && Array.isArray(bloco.content)) {
          for (const resultado of bloco.content) {
            resultados.push({
              url: resultado.url,
              titulo: resultado.title,
              idade: resultado.page_age,
            });
          }
        }
      }

      motivoDeParada = resposta.stop_reason ?? "end_turn";
      if (motivoDeParada !== "pause_turn") break;
      // A busca pausou a resposta: devolve o que veio para o servidor continuar de onde parou.
      mensagens.push({
        role: "assistant",
        content: resposta.content as Anthropic.ContentBlockParam[],
      });
    }

    return {
      texto: textos.join("\n").trim(),
      resultadosDeBusca: resultados,
      motivoDeParada,
      uso: {
        modelo: chamada.modelo,
        tokensEntrada,
        tokensSaida,
        tokensCacheLeitura,
        buscas,
        usd: calcularUsd(chamada.modelo, {
          tokensEntrada,
          tokensSaida,
          tokensCacheLeitura,
          buscas,
        }),
      },
    };
  }
}
