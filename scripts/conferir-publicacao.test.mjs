import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { problemasDaPublicacao } from "./conferir-publicacao.mjs";

function pastaCom(arquivos) {
  const pasta = mkdtempSync(join(tmpdir(), "arauto-pub-"));
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    mkdirSync(dirname(join(pasta, nome)), { recursive: true });
    writeFileSync(join(pasta, nome), conteudo);
  }
  return pasta;
}

const BASE = {
  "index.html": "<html></html>",
  "sw.js": "self.x = 1;",
  "manifest.webmanifest": "{}",
  "favicon.svg": "<svg></svg>",
  "assets/app.js": "console.log(1)",
  "briefing/ultimo.json": "{}",
};

test("uma publicação normal passa", () => {
  const pasta = pastaCom(BASE);
  try {
    assert.deepEqual(problemasDaPublicacao(pasta), []);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("barra .env, mapa de código, estado do pipeline e JSON fora de briefing/", () => {
  const pasta = pastaCom({
    ...BASE,
    ".env": "A=1",
    "assets/app.js.map": "{}",
    "estado.json": "{}",
    "briefing/estado.json": "{}",
    "dados/outro.json": "{}",
  });
  try {
    const texto = problemasDaPublicacao(pasta).join("\n");
    assert.match(texto, /\.env/);
    assert.match(texto, /mapa de código/);
    assert.match(texto, /estado\.json/);
    assert.match(texto, /JSON fora de briefing/);
    assert.match(texto, /estado interno do pipeline/);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("barra tipo de arquivo estranho e acusa os obrigatórios que faltam", () => {
  const pasta = pastaCom({ "index.html": "<html></html>", "script.sh": "rm -rf /" });
  try {
    const texto = problemasDaPublicacao(pasta).join("\n");
    assert.match(texto, /script\.sh: tipo de arquivo/);
    assert.match(texto, /sw\.js: arquivo obrigatório ausente/);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("acusa segredo dentro de arquivo de texto, sem mostrar o valor", () => {
  const chave = ["sk-", "ant-", "api03-", "z".repeat(40)].join("");
  const pasta = pastaCom({ ...BASE, "assets/vaza.js": `const k = "${chave}";` });
  try {
    const problemas = problemasDaPublicacao(pasta);
    assert.equal(problemas.length, 1);
    assert.match(problemas[0], /Anthropic/);
    assert.equal(problemas.join("").includes(chave), false);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("pasta inexistente é problema, não erro", () => {
  assert.equal(problemasDaPublicacao(join(tmpdir(), "nao-existe-arauto-xyz")).length, 1);
});
