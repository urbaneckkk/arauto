/** Dados de teste. Todo o conteúdo é fictício. */

export function fonte(n = 1) {
  return {
    titulo: `Fonte de exemplo ${n}`,
    url: `https://agenciabrasil.ebc.com.br/geral/noticia/2026-11/exemplo-${n}`,
    publicadoEm: "2026-11-04T08:30:00-03:00",
  };
}

export function noticia(n = 1) {
  return {
    titulo: `Notícia de exemplo ${n}`,
    oQueAconteceu: "Algo aconteceu. Aqui vai uma segunda frase com mais detalhes.",
    porQueImporta: "Isso muda a rotina de quem mora em Curitiba.",
    lados: [],
    continuaDeOntem: null,
    fontes: [fonte(n)],
  };
}

/** Briefing válido, no formato do contrato do briefing original. */
export function briefingValido() {
  return {
    data: "2026-11-04",
    historiaDoDia: {
      titulo: "Filhote de capivara é adotado por quartel de bombeiros",
      resumo: "Um filhote resgatado foi acolhido por bombeiros.",
      veiculos: 42,
      paises: 17,
      pontuacao: 0.87,
    },
    tema: {
      id: "ternura_animal",
      intensidade: 2,
      confianca: 0.92,
      motivo: "A história mais comentada é um resgate com final feliz.",
      notificacao: {
        titulo: "Filhote resgatado",
        corpo: "Bombeiros adotam um filhote de capivara.",
      },
    },
    emTrintaSegundos: ["Primeira coisa do dia.", "Segunda coisa do dia.", "Terceira coisa do dia."],
    tempo: {
      minC: 16,
      maxC: 27,
      chuvaPct: 40,
      resumo: "Manhã fresca e tarde com chance de chuva.",
      alertas: [],
    },
    secoes: [
      { id: "politica", noticias: [noticia(1), noticia(2)] },
      { id: "economia", noticias: [noticia(3), noticia(4)] },
    ],
    curiosidade: noticia(5),
    custo: { usd: 0.41, buscas: 7 },
  };
}

export function alertaValido() {
  return {
    fonte: "inmet",
    tipo: "Tempestade",
    nivel: "laranja",
    inicio: "2026-11-04T00:00:00-03:00",
    fim: "2026-11-04T23:59:00-03:00",
  };
}

export function sinaisNeutros() {
  return {
    perdaDeVidas: false,
    vitimasConfirmadas: null,
    escaladaMilitar: false,
    armaOuInstalacaoNuclear: false,
    animalEmSofrimento: false,
  };
}
