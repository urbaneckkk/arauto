import { BriefingSchema } from "@arauto/core";

const noticia = (n: number) => ({
  titulo: `Obra ${n} começa no bairro Alfa`,
  oQueAconteceu: "A prefeitura anunciou a obra. As equipes começam o trabalho nesta semana.",
  porQueImporta: "Pode afetar o trânsito de quem passa pela região.",
  lados: [],
  continuaDeOntem: null,
  fontes: [
    {
      titulo: `Fonte ${n}`,
      url: `https://g1.globo.com/politica/noticia/evento-${n}`,
      publicadoEm: "2026-11-05T05:00:00.000Z",
    },
  ],
});

/** Briefing válido, para os testes que só precisam de um. */
export function briefingExemplo() {
  return BriefingSchema.parse({
    data: "2026-11-05",
    historiaDoDia: {
      titulo: "Prefeitura anuncia obras",
      resumo: "A prefeitura anunciou várias obras.",
      veiculos: 2,
      paises: 1,
      pontuacao: 0.5,
    },
    tema: {
      id: "politica",
      intensidade: 2,
      confianca: 0.9,
      motivo: "Assunto de governo local.",
      notificacao: { titulo: "Obras na cidade", corpo: "A prefeitura anunciou várias obras." },
    },
    emTrintaSegundos: ["Primeira.", "Segunda.", "Terceira."],
    tempo: { minC: 17.8, maxC: 26.1, chuvaPct: 85, resumo: "Dia chuvoso.", alertas: [] },
    secoes: [{ id: "politica", noticias: [noticia(1), noticia(2)] }],
    curiosidade: noticia(3),
    custo: { usd: 0.4, buscas: 2 },
  });
}
