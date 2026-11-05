import assert from "node:assert/strict";
import { test } from "node:test";
import { lerDoEnv } from "./ativar-automacao.mjs";

test("lê o valor de uma variável do .env, com ou sem aspas e export", () => {
  const env = ["# comentário", "OUTRA=1", "ANTHROPIC_API_KEY=abc123", ""].join("\n");
  assert.equal(lerDoEnv(env, "ANTHROPIC_API_KEY"), "abc123");
  assert.equal(lerDoEnv('export CHAVE="com aspas"', "CHAVE"), "com aspas");
  assert.equal(lerDoEnv("CHAVE='simples'\r\nX=2", "CHAVE"), "simples");
});

test("variável ausente, vazia ou só comentada vira texto vazio", () => {
  assert.equal(lerDoEnv("A=1", "B"), "");
  assert.equal(lerDoEnv("B=", "B"), "");
  assert.equal(lerDoEnv("# B=segredo", "B"), "");
});

test("não confunde variáveis com o mesmo começo", () => {
  assert.equal(lerDoEnv("ANTHROPIC_API_KEY_ANTIGA=velha", "ANTHROPIC_API_KEY"), "");
});
