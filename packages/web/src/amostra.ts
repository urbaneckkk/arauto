import type { Briefing, Noticia, TemaId } from "@arauto/core";
import { TEMAS } from "./temas";

/**
 * Briefing de MENTIRA, só para o /lab e para os testes. Os títulos e endereços são inventados:
 * nunca aparecem como notícia de verdade (o /lab avisa isso na tela).
 */
function noticia(titulo: string, extra: Partial<Noticia> = {}): Noticia {
  return {
    titulo,
    oQueAconteceu:
      "Este é um texto de exemplo para mostrar como a tela fica. Ele não descreve um fato real. As frases são curtas, como no briefing de verdade.",
    porQueImporta: "Serve para conferir cores, tamanho de letra e espaçamento de cada tema.",
    lados: [],
    continuaDeOntem: null,
    fontes: [
      {
        titulo: "Fonte de exemplo",
        url: "https://example.com/",
        publicadoEm: "2026-01-01T09:00:00-03:00",
      },
    ],
    ...extra,
  };
}

export function briefingDeAmostra(tema: TemaId = "neutro"): Briefing {
  return {
    data: "2026-01-01",
    historiaDoDia: {
      titulo: TEMAS[tema].exemplo,
      resumo: "Exemplo do /lab: nada aqui é notícia de verdade.",
      veiculos: 12,
      paises: 5,
      pontuacao: 0.8,
      pontuacaoParcial: false,
    },
    tema: {
      id: tema,
      intensidade: 2,
      confianca: 0.9,
      motivo: "Tema escolhido à mão no laboratório.",
      notificacao: {
        titulo: "Briefing de exemplo",
        corpo: "Texto de exemplo do laboratório de temas.",
      },
    },
    emTrintaSegundos: [
      "Primeiro ponto de exemplo, curto e direto.",
      "Segundo ponto de exemplo, também curto.",
      "Terceiro ponto de exemplo para fechar.",
    ],
    tempo: {
      minC: 11,
      maxC: 22,
      chuvaPct: 40,
      resumo: "Dia de exemplo em Curitiba: manhã fria e tarde mais amena.",
      alertas: [],
    },
    secoes: [
      {
        id: "politica",
        noticias: [
          noticia("Notícia de exemplo sobre política", {
            lados: [
              { quem: "Governo", posicao: "Diz que a medida é necessária." },
              { quem: "Oposição", posicao: "Diz que o texto precisa de ajustes." },
            ],
            continuaDeOntem: "Ontem o tema já era discutido no plenário.",
          }),
        ],
      },
      { id: "economia", noticias: [noticia("Notícia de exemplo sobre economia")] },
      { id: "parana", noticias: [noticia("Notícia de exemplo sobre o Paraná")] },
    ],
    curiosidade: noticia("Curiosidade de exemplo"),
    custo: { usd: 0, buscas: 0 },
  };
}
