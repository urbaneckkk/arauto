import { describe, expect, it } from "vitest";
import { RepositorioEmMemoria } from "../src/repo/memoria.js";
import {
  Acesso,
  normalizarCodigo,
  sortearCodigo,
  sortearToken,
  VALIDADE_DO_CODIGO_MS,
} from "../src/servico/acesso.js";
import { relogioAjustavel } from "./ajudantes.js";

function montar(inatividadeDias = 90) {
  const repo = new RepositorioEmMemoria();
  const relogio = relogioAjustavel("2026-11-05T09:00:00.000Z");
  const acesso = new Acesso({ repo, relogio, inatividadeDias });
  return { repo, relogio, acesso };
}

describe("código e token", () => {
  it("o código tem o formato XXXX-XXXX, sem caracteres que se confundem", () => {
    for (let i = 0; i < 500; i++) {
      expect(sortearCodigo()).toMatch(
        /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}$/,
      );
    }
  });

  it("os códigos não se repetem e usam o alfabeto inteiro (sem viés óbvio)", () => {
    const codigos = new Set<string>();
    const letras = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      const codigo = sortearCodigo();
      codigos.add(codigo);
      for (const letra of codigo.replace("-", "")) letras.add(letra);
    }
    expect(codigos.size).toBe(3000);
    expect(letras.size).toBe(31);
  });

  it("o token tem o prefixo, 256 bits e nunca se repete", () => {
    const tokens = new Set(Array.from({ length: 200 }, sortearToken));
    expect(tokens.size).toBe(200);
    for (const token of tokens) {
      expect(token).toMatch(/^ar1_[A-Za-z0-9_-]{43}$/);
    }
  });

  it("normalizar ignora caixa, hífen e espaços", () => {
    expect(normalizarCodigo(" abcd-efgh ")).toBe("ABCDEFGH");
    expect(normalizarCodigo("ab cd.ef_gh")).toBe("ABCDEFGH");
  });
});

describe("pareamento", () => {
  it("troca o código por um token, e o token não fica guardado em claro", async () => {
    const { repo, acesso } = montar();
    const { codigo, expiraEm } = await acesso.gerarCodigo();
    expect(Date.parse(expiraEm) - Date.parse("2026-11-05T09:00:00.000Z")).toBe(
      VALIDADE_DO_CODIGO_MS,
    );

    const resultado = await acesso.parear(codigo, "Celular do André");
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.token).toMatch(/^ar1_/);
    expect(resultado.dispositivo).toMatchObject({ nome: "Celular do André", revogadoEm: null });

    // O repositório só conhece o hash: o token puro não acha nada, e o código puro também não.
    expect(await repo.buscarDispositivoPorToken(resultado.token)).toBeNull();
    expect(await repo.consumirCodigo(codigo, "2026-11-05T09:00:00.000Z")).toBe(false);
    expect(JSON.stringify(await repo.listarDispositivos())).not.toContain(resultado.token);
  });

  it("aceita o código em minúsculas, sem hífen e com espaços", async () => {
    const { acesso } = montar();
    const { codigo } = await acesso.gerarCodigo();
    const digitado = ` ${codigo.replace("-", "").toLowerCase()} `;
    expect((await acesso.parear(digitado, "x")).ok).toBe(true);
  });

  it("o código vale uma vez só", async () => {
    const { acesso } = montar();
    const { codigo } = await acesso.gerarCodigo();
    expect((await acesso.parear(codigo, "a")).ok).toBe(true);
    expect((await acesso.parear(codigo, "b")).ok).toBe(false);
  });

  it("o código expira em 10 minutos", async () => {
    const { acesso, relogio } = montar();
    const { codigo } = await acesso.gerarCodigo();
    relogio.avancar(VALIDADE_DO_CODIGO_MS);
    expect((await acesso.parear(codigo, "a")).ok).toBe(false);
  });

  it("5 tentativas erradas queimam o código, mesmo que a sexta fosse a certa", async () => {
    const { acesso } = montar();
    const { codigo } = await acesso.gerarCodigo();
    for (let i = 0; i < 5; i++) expect((await acesso.parear("ZZZZ-ZZZZ", "x")).ok).toBe(false);
    expect((await acesso.parear(codigo, "x")).ok).toBe(false);
  });

  it("4 tentativas erradas ainda deixam o código certo passar", async () => {
    const { acesso } = montar();
    const { codigo } = await acesso.gerarCodigo();
    for (let i = 0; i < 4; i++) await acesso.parear("ZZZZ-ZZZZ", "x");
    expect((await acesso.parear(codigo, "x")).ok).toBe(true);
  });

  it("código com tamanho errado também conta como tentativa", async () => {
    const { acesso } = montar();
    const { codigo } = await acesso.gerarCodigo();
    for (const lixo of ["", "A", "ABCD", "ABCD-EFGHI", "x".repeat(5000)]) {
      expect((await acesso.parear(lixo, "x")).ok).toBe(false);
    }
    expect((await acesso.parear(codigo, "x")).ok).toBe(false);
  });

  it("o nome é aparado, limitado a 60 caracteres e nunca fica vazio", async () => {
    const { acesso } = montar();
    const nomes: string[] = [];
    for (const digitado of ["   Notebook   ", "x".repeat(200), "   "]) {
      const { codigo } = await acesso.gerarCodigo();
      const r = await acesso.parear(codigo, digitado);
      if (r.ok) nomes.push(r.dispositivo.nome);
    }
    expect(nomes).toEqual(["Notebook", "x".repeat(60), "Dispositivo"]);
  });
});

describe("autenticação", () => {
  async function aparelho(acesso: Acesso) {
    const { codigo } = await acesso.gerarCodigo();
    const r = await acesso.parear(codigo, "Celular");
    if (!r.ok) throw new Error("pareamento do teste falhou");
    return r;
  }

  it("aceita o token certo", async () => {
    const { acesso } = montar();
    const { token, dispositivo } = await aparelho(acesso);
    const r = await acesso.autenticar(token);
    expect(r).toMatchObject({ ok: true, dispositivo: { id: dispositivo.id } });
  });

  it("recusa ausente, formato errado e token desconhecido", async () => {
    const { acesso } = montar();
    await aparelho(acesso);
    expect(await acesso.autenticar(undefined)).toEqual({ ok: false, motivo: "ausente" });
    expect(await acesso.autenticar("")).toEqual({ ok: false, motivo: "ausente" });
    for (const lixo of [
      "abc",
      "Bearer x",
      `ar1_${"a".repeat(500)}`,
      "ar1_com espaço",
      "ar1_'; --",
    ]) {
      expect(await acesso.autenticar(lixo)).toEqual({ ok: false, motivo: "invalido" });
    }
    expect(await acesso.autenticar(sortearToken())).toEqual({ ok: false, motivo: "invalido" });
  });

  it("token com formato impossível nem chega ao banco", async () => {
    const repo = new RepositorioEmMemoria();
    let consultas = 0;
    const original = repo.buscarDispositivoPorToken.bind(repo);
    repo.buscarDispositivoPorToken = async (hash) => {
      consultas++;
      return original(hash);
    };
    const acesso = new Acesso({
      repo,
      relogio: relogioAjustavel("2026-11-05T09:00:00.000Z"),
      inatividadeDias: 90,
    });
    await acesso.autenticar("x".repeat(10_000));
    await acesso.autenticar("ar1_'; drop table dispositivos; --");
    expect(consultas).toBe(0);
  });

  it("depois de revogado, o token para de valer", async () => {
    const { acesso } = montar();
    const { token, dispositivo } = await aparelho(acesso);
    expect(await acesso.revogar(dispositivo.id)).toBe(true);
    expect(await acesso.autenticar(token)).toEqual({ ok: false, motivo: "revogado" });
  });

  it("um aparelho revogado não afeta os outros", async () => {
    const { acesso } = montar();
    const a = await aparelho(acesso);
    const b = await aparelho(acesso);
    await acesso.revogar(a.dispositivo.id);
    expect((await acesso.autenticar(b.token)).ok).toBe(true);
  });

  it("expira por inatividade (90 dias), mas o uso renova o prazo", async () => {
    const { acesso, relogio } = montar(90);
    const { token } = await aparelho(acesso);

    relogio.avancarDias(80);
    expect((await acesso.autenticar(token)).ok).toBe(true); // usa no dia 80
    relogio.avancarDias(80); // dia 160: 80 dias desde o último uso
    expect((await acesso.autenticar(token)).ok).toBe(true);
    relogio.avancarDias(91); // 91 dias sem uso
    expect(await acesso.autenticar(token)).toEqual({ ok: false, motivo: "inativo" });
  });

  it("nunca usado também expira", async () => {
    const { acesso, relogio } = montar(30);
    const { token } = await aparelho(acesso);
    relogio.avancarDias(31);
    expect(await acesso.autenticar(token)).toEqual({ ok: false, motivo: "inativo" });
  });

  it("grava o último uso no máximo uma vez por hora", async () => {
    const repo = new RepositorioEmMemoria();
    const relogio = relogioAjustavel("2026-11-05T09:00:00.000Z");
    const acesso = new Acesso({ repo, relogio, inatividadeDias: 90 });
    let gravacoes = 0;
    const original = repo.registrarUsoDoDispositivo.bind(repo);
    repo.registrarUsoDoDispositivo = async (id, quando) => {
      gravacoes++;
      return original(id, quando);
    };
    const { token } = await aparelho(acesso);

    for (let i = 0; i < 50; i++) {
      relogio.avancarMinutos(1);
      await acesso.autenticar(token);
    }
    expect(gravacoes).toBe(1); // 50 minutos de uso, uma gravação
    relogio.avancarMinutos(30);
    await acesso.autenticar(token);
    expect(gravacoes).toBe(2);
  });
});
