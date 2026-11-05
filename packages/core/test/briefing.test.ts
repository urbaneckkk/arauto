import { describe, expect, it } from "vitest";
import {
  AlertaSchema,
  BriefingSchema,
  FonteSchema,
  NoticiaSchema,
  TETO_NOTICIAS,
  TempoSchema,
} from "../src/index.js";
import { alertaValido, briefingValido, fonte, noticia } from "./fixtures.js";

describe("contrato do briefing", () => {
  it("aceita um briefing válido", () => {
    const resultado = BriefingSchema.safeParse(briefingValido());
    expect(resultado.success).toBe(true);
  });

  it("pontuacaoParcial vale falso quando ausente", () => {
    const resultado = BriefingSchema.parse(briefingValido());
    expect(resultado.historiaDoDia.pontuacaoParcial).toBe(false);
  });

  it("aceita curiosidade nula (nunca se preenche lacuna com texto inventado)", () => {
    expect(BriefingSchema.safeParse({ ...briefingValido(), curiosidade: null }).success).toBe(true);
  });

  it("recusa tema fora do catálogo", () => {
    const base = briefingValido();
    const invalido = { ...base, tema: { ...base.tema, id: "tema_que_nao_existe" } };
    expect(BriefingSchema.safeParse(invalido).success).toBe(false);
  });

  it("exige exatamente 3 itens em 'Em 30 segundos'", () => {
    const base = briefingValido();
    expect(BriefingSchema.safeParse({ ...base, emTrintaSegundos: ["a", "b"] }).success).toBe(false);
    expect(
      BriefingSchema.safeParse({ ...base, emTrintaSegundos: ["a", "b", "c", "d"] }).success,
    ).toBe(false);
  });

  it("recusa data fora do formato AAAA-MM-DD", () => {
    expect(BriefingSchema.safeParse({ ...briefingValido(), data: "04/11/2026" }).success).toBe(
      false,
    );
  });

  it("recusa briefing sem seções", () => {
    expect(BriefingSchema.safeParse({ ...briefingValido(), secoes: [] }).success).toBe(false);
  });

  it("recusa seção repetida", () => {
    const invalido = {
      ...briefingValido(),
      secoes: [
        { id: "politica", noticias: [noticia(1)] },
        { id: "politica", noticias: [noticia(2)] },
      ],
    };
    expect(BriefingSchema.safeParse(invalido).success).toBe(false);
  });

  it("recusa seção com mais de 4 notícias", () => {
    const cinco = [1, 2, 3, 4, 5].map((n) => noticia(n));
    const invalido = { ...briefingValido(), secoes: [{ id: "politica", noticias: cinco }] };
    expect(BriefingSchema.safeParse(invalido).success).toBe(false);
  });

  it(`aceita ${TETO_NOTICIAS} notícias e recusa ${TETO_NOTICIAS + 1}`, () => {
    const grupo = (inicio: number, quantas: number) =>
      Array.from({ length: quantas }, (_, i) => noticia(inicio + i));
    const comTotal = (ultima: number) => ({
      ...briefingValido(),
      secoes: [
        { id: "politica", noticias: grupo(1, 4) },
        { id: "economia", noticias: grupo(5, 4) },
        { id: "agro", noticias: grupo(9, 4) },
        { id: "mundo", noticias: grupo(13, ultima) },
      ],
    });
    expect(BriefingSchema.safeParse(comTotal(2)).success).toBe(true); // 4 + 4 + 4 + 2 = 14
    expect(BriefingSchema.safeParse(comTotal(3)).success).toBe(false); // 15
  });

  it("recusa seção com id desconhecido", () => {
    const invalido = { ...briefingValido(), secoes: [{ id: "futebol", noticias: [noticia(1)] }] };
    expect(BriefingSchema.safeParse(invalido).success).toBe(false);
  });

  it("recusa pontuação acima de 1 e custo negativo", () => {
    const base = briefingValido();
    expect(
      BriefingSchema.safeParse({
        ...base,
        historiaDoDia: { ...base.historiaDoDia, pontuacao: 1.2 },
      }).success,
    ).toBe(false);
    expect(BriefingSchema.safeParse({ ...base, custo: { usd: -0.01, buscas: 0 } }).success).toBe(
      false,
    );
  });
});

describe("notícia e fonte", () => {
  it("toda notícia leva ao menos uma fonte", () => {
    expect(NoticiaSchema.safeParse({ ...noticia(1), fontes: [] }).success).toBe(false);
  });

  it("continuaDeOntem aceita texto ou nulo, mas não texto vazio", () => {
    expect(
      NoticiaSchema.safeParse({ ...noticia(1), continuaDeOntem: "Agora há acordo." }).success,
    ).toBe(true);
    expect(NoticiaSchema.safeParse({ ...noticia(1), continuaDeOntem: "" }).success).toBe(false);
  });

  it("a fonte só aceita URL https", () => {
    expect(FonteSchema.safeParse(fonte(1)).success).toBe(true);
    expect(FonteSchema.safeParse({ ...fonte(1), url: "http://exemplo.com/a" }).success).toBe(false);
    expect(FonteSchema.safeParse({ ...fonte(1), url: "não é url" }).success).toBe(false);
    expect(FonteSchema.safeParse({ ...fonte(1), url: "javascript:alert(1)" }).success).toBe(false);
  });

  it("a data de publicação precisa ter fuso horário", () => {
    expect(
      FonteSchema.safeParse({ ...fonte(1), publicadoEm: "2026-11-04T08:30:00Z" }).success,
    ).toBe(true);
    expect(FonteSchema.safeParse({ ...fonte(1), publicadoEm: "2026-11-04T08:30:00" }).success).toBe(
      false,
    );
    expect(FonteSchema.safeParse({ ...fonte(1), publicadoEm: "ontem" }).success).toBe(false);
  });
});

describe("tempo e alertas", () => {
  const tempo = briefingValido().tempo;

  it("aceita o tempo do exemplo", () => {
    expect(TempoSchema.safeParse(tempo).success).toBe(true);
  });

  it("recusa mínima maior que a máxima e chuva fora de 0 a 100", () => {
    expect(TempoSchema.safeParse({ ...tempo, minC: 30, maxC: 20 }).success).toBe(false);
    expect(TempoSchema.safeParse({ ...tempo, chuvaPct: 101 }).success).toBe(false);
    expect(TempoSchema.safeParse({ ...tempo, chuvaPct: -1 }).success).toBe(false);
  });

  it("aceita temperatura decimal, como vem do Open-Meteo", () => {
    expect(TempoSchema.safeParse({ ...tempo, minC: 15.8, maxC: 26.4 }).success).toBe(true);
  });

  it("aceita alerta do INMET e recusa nível ou fonte desconhecidos", () => {
    expect(AlertaSchema.safeParse(alertaValido()).success).toBe(true);
    expect(AlertaSchema.safeParse({ ...alertaValido(), nivel: "roxo" }).success).toBe(false);
    expect(AlertaSchema.safeParse({ ...alertaValido(), fonte: "twitter" }).success).toBe(false);
  });

  it("recusa alerta que termina antes de começar", () => {
    const invalido = {
      ...alertaValido(),
      inicio: "2026-11-04T12:00:00-03:00",
      fim: "2026-11-04T08:00:00-03:00",
    };
    expect(AlertaSchema.safeParse(invalido).success).toBe(false);
  });
});

describe("previsão indisponível", () => {
  const tempo = briefingValido().tempo;

  it("aceita previsão nula (nunca se inventa número), mantendo os alertas", () => {
    const semPrevisao = {
      ...tempo,
      minC: null,
      maxC: null,
      chuvaPct: null,
      resumo: "A previsão do tempo não está disponível hoje.",
      alertas: [alertaValido()],
    };
    expect(TempoSchema.safeParse(semPrevisao).success).toBe(true);
  });

  it("com só uma das temperaturas, não compara", () => {
    expect(TempoSchema.safeParse({ ...tempo, minC: 30, maxC: null }).success).toBe(true);
  });
});
