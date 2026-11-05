import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { briefingDeAmostra } from "../src/amostra";
import { IndiceSchema, RegistroSchema } from "../src/dados";

const registro = {
  data: "2026-01-01",
  versao: 1,
  criadoEm: "2026-01-01T09:30:00Z",
  briefing: briefingDeAmostra(),
  avisos: [],
};

describe("dados publicados", () => {
  it("aceita um registro válido e completa avisos ausentes", () => {
    expect(RegistroSchema.safeParse(registro).success).toBe(true);
    const { avisos: _ignorado, ...semAvisos } = registro;
    expect(RegistroSchema.parse(semAvisos).avisos).toEqual([]);
  });

  it("recusa briefing fora do contrato (arquivo corrompido não chega à tela)", () => {
    const quebrado = {
      ...registro,
      briefing: { ...registro.briefing, emTrintaSegundos: ["só um"] },
    };
    expect(RegistroSchema.safeParse(quebrado).success).toBe(false);
    expect(RegistroSchema.safeParse({ ...registro, briefing: null }).success).toBe(false);
    expect(RegistroSchema.safeParse({}).success).toBe(false);
  });

  it("recusa fonte que não seja https", () => {
    const b = briefingDeAmostra();
    const primeira = b.secoes[0]?.noticias[0];
    if (!primeira) throw new Error("amostra sem notícia");
    primeira.fontes = [
      { titulo: "x", url: "javascript:alert(1)", publicadoEm: "2026-01-01T09:00:00-03:00" },
    ];
    expect(RegistroSchema.safeParse({ ...registro, briefing: b }).success).toBe(false);
  });

  it("valida o índice do histórico", () => {
    expect(
      IndiceSchema.safeParse([{ data: "2026-01-01", titulo: "x", tema: "neutro", versao: 1 }])
        .success,
    ).toBe(true);
    expect(IndiceSchema.safeParse([{ data: "2026-01-01" }]).success).toBe(false);
  });

  // Se existir uma exportação local (pnpm site:exportar), ela tem que passar no mesmo contrato do site.
  const local = new URL("../public/briefing/ultimo.json", import.meta.url);
  it.skipIf(!existsSync(local))("o ultimo.json exportado localmente respeita o contrato", () => {
    expect(RegistroSchema.safeParse(JSON.parse(readFileSync(local, "utf8"))).success).toBe(true);
  });
});
