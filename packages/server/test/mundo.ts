import { urlDoGdelt } from "../src/coleta/gdelt.js";
import { URL_INMET } from "../src/coleta/inmet.js";
import { URL_OPEN_METEO } from "../src/coleta/openmeteo.js";
import { FEEDS } from "../src/config/feeds.js";
import type { ChamadaDeModelo, RespostaDoModelo } from "../src/modelos/cliente.js";
import { ClienteFalso, respostaDeTexto } from "../src/modelos/falso.js";
import { RepositorioEmMemoria } from "../src/repo/memoria.js";
import { relogioFixo } from "../src/util/tempo.js";
import { ok, type RespostaDeTeste, rss, transporteDeMapa } from "./ajudantes.js";

/** 05/11/2026, 06:00 em São Paulo. */
export const AGORA = new Date("2026-11-05T09:00:00Z");
export const relogio = relogioFixo(AGORA);

export const HAIKU = "claude-haiku-5-5";
export const SONNET = "claude-sonnet-5-5";

export function haAlgumasHoras(horas: number): string {
  return new Date(AGORA.getTime() - horas * 3_600_000).toUTCString();
}

const feedAgbr = FEEDS.find((f) => f.id === "agbr-ultimas");
const feedG1 = FEEDS.find((f) => f.id === "g1-home");
if (!feedAgbr || !feedG1) throw new Error("feeds de teste não encontrados na configuração");

/**
 * Dois feeds com 20 itens cada, sobre os mesmos 20 "eventos" inventados, em domínios da lista branca.
 * Os títulos são fictícios; o modelo falso agrupa pelo número do evento.
 */
function itensDoFeed(dominio: string, caminho: string) {
  return Array.from({ length: 20 }, (_, i) => {
    const n = i + 1;
    return {
      titulo: `Evento ${n}: prefeitura anuncia obra fictícia número ${n} no bairro Alfa`,
      url: `https://${dominio}/${caminho}/evento-${n}`,
      data: haAlgumasHoras(0.5 + n * 0.5),
      resumo: `Resumo inventado do evento ${n}, com detalhes que não existem em lugar nenhum.`,
    };
  });
}

export const URL_AGBR = feedAgbr.url;
export const URL_G1 = feedG1.url;

export const respostaOpenMeteo = JSON.stringify({
  daily: {
    temperature_2m_max: [26.1],
    temperature_2m_min: [17.8],
    precipitation_probability_max: [85],
    precipitation_sum: [10.7],
    weather_code: [95],
  },
});

export const respostaInmet = JSON.stringify({
  hoje: [
    {
      id_aviso: 28611,
      descricao: "Tempestade",
      severidade: "Perigo",
      data_inicio: "2026-11-05T00:00:00.000Z",
      hora_inicio: "09:00",
      data_fim: "2026-11-05T00:00:00.000Z",
      hora_fim: "23:59",
      geocodes: "4100103,4106902",
      encerrado: false,
      riscos: ["Chuva forte."],
      instrucoes: ["Evite áreas alagadas."],
    },
  ],
  futuro: [],
});

export interface OpcoesDoMundo {
  /** Respostas extras ou substitutas por URL. */
  mapa?: Record<string, RespostaDeTeste>;
  verificacoes?: Parameters<typeof transporteDeMapa>[1];
}

export function transporteDoMundo({ mapa = {}, verificacoes = {} }: OpcoesDoMundo = {}) {
  return transporteDeMapa(
    {
      [URL_AGBR]: ok(rss(itensDoFeed("agenciabrasil.ebc.com.br", "geral/noticia"))),
      [URL_G1]: ok(rss(itensDoFeed("g1.globo.com", "politica/noticia"))),
      [URL_OPEN_METEO]: ok(respostaOpenMeteo, "application/json"),
      [URL_INMET]: ok(respostaInmet, "application/json"),
      ...mapa,
    },
    verificacoes,
  );
}

/** Lê as linhas "id | veículo | dica | título" que o termômetro manda ao modelo. */
function linhasDoTermometro(usuario: string) {
  return usuario.split("\n").map((linha) => {
    const [id = "", veiculo = "", , titulo = ""] = linha.split(" | ");
    return { id, veiculo, titulo };
  });
}

export function agrupamentoFalso(chamada: ChamadaDeModelo): RespostaDoModelo {
  const porEvento = new Map<string, string[]>();
  for (const { id, titulo } of linhasDoTermometro(chamada.usuario)) {
    const n = titulo.match(/^Evento (\d+):/)?.[1];
    if (!n) continue;
    porEvento.set(n, [...(porEvento.get(n) ?? []), id]);
  }
  const categorias = ["politica", "economia", "mundo"] as const;
  const acontecimentos = [...porEvento.entries()].map(([n, itens]) => ({
    titulo: `Evento ${n}: obra fictícia no bairro Alfa`,
    categoria: n === "1" ? "curiosidade" : categorias[Number(n) % 3],
    itens,
    consultaGdelt: `event ${n}`,
  }));
  return respostaDeTexto(HAIKU, JSON.stringify({ acontecimentos }), {
    tokensEntrada: 9000,
    tokensSaida: 3000,
  });
}

export function apuracaoFalsa(): RespostaDoModelo {
  return respostaDeTexto(
    SONNET,
    "- [historia_do_dia] Obra confirmada por outra fonte. (fonte: [w01])",
    {
      tokensEntrada: 12_000,
      tokensSaida: 800,
      buscas: 2,
      resultadosDeBusca: [
        {
          url: "https://www.bbc.com/portuguese/articles/abc",
          titulo: "Matéria de teste",
          idade: "3 hours ago",
        },
      ],
    },
  );
}

/** Redação que cita os identificadores que o material realmente traz. */
export function redacaoFalsa(chamada: ChamadaDeModelo): RespostaDoModelo {
  const ids = [...chamada.usuario.matchAll(/\[(i\d{3})\]/g)].map((m) => m[1] as string);
  const unicos = [...new Set(ids)];
  const noticia = (n: number, fonte: string | undefined) => ({
    titulo: `Obra ${n} começa no bairro Alfa`,
    oQueAconteceu: `A obra ${n} foi anunciada pela prefeitura. As equipes começam o trabalho nesta semana.`,
    porQueImporta: "Pode afetar o trânsito de quem passa pela região.",
    lados: [],
    continuaDeOntem: null,
    fontes: fonte ? [fonte] : [],
  });
  const redacao = {
    historiaDoDia: {
      titulo: "Prefeitura anuncia obras",
      resumo: "A prefeitura anunciou várias obras.",
    },
    emTrintaSegundos: ["Primeira.", "Segunda.", "Terceira."],
    tempoResumo: "Dia chuvoso, com alerta de tempestade.",
    secoes: [
      { id: "politica", noticias: [noticia(1, unicos[0]), noticia(2, unicos[2])] },
      { id: "economia", noticias: [noticia(3, unicos[4])] },
    ],
    curiosidade: noticia(4, unicos[6]),
  };
  return respostaDeTexto(SONNET, JSON.stringify(redacao), {
    tokensEntrada: 20_000,
    tokensSaida: 6000,
  });
}

export function temaFalso(id = "politica"): RespostaDoModelo {
  return respostaDeTexto(
    HAIKU,
    JSON.stringify({
      id,
      intensidade: 2,
      confianca: 0.9,
      motivo: "Assunto de obras e governo local.",
      notificacao: { titulo: "Obras na cidade", corpo: "A prefeitura anunciou várias obras." },
      sinais: {
        perdaDeVidas: false,
        vitimasConfirmadas: null,
        atentadoOuMassacre: false,
        escaladaMilitar: false,
        armaOuInstalacaoNuclear: false,
        animalEmSofrimento: false,
      },
    }),
    { tokensEntrada: 800, tokensSaida: 200 },
  );
}

export function modeloDoMundo() {
  return new ClienteFalso({
    termometro: agrupamentoFalso,
    apuracao: apuracaoFalsa,
    redacao: redacaoFalsa,
    tema: temaFalso(),
  });
}

export const envDeTeste = {
  MAX_USD_POR_EXECUCAO: 1,
  MAX_USD_MES: 25,
  GASTOS_PAUSADOS: false,
  MODELO_BARATO: HAIKU,
  MODELO_REDATOR: SONNET,
};

export const novoRepo = () => new RepositorioEmMemoria();

/** Resposta do GDELT para uma consulta (as de teste são "event N"). */
export function urlGdeltDoEvento(n: number): string {
  return urlDoGdelt(`event ${n}`);
}
