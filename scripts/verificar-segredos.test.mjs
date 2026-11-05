import assert from "node:assert/strict";
import { test } from "node:test";
import { analisarTexto, nomeProibido } from "./verificar-segredos.mjs";

// Os "segredos" de teste são montados em tempo de execução, para este arquivo
// não ser acusado pelo próprio verificador.
const juntar = (...partes) => partes.join("");

test("acha chave da Anthropic e informa a linha", () => {
  const texto = `linha 1\nconst k = "${juntar("sk-", "ant-", "api03-", "a".repeat(40))}";`;
  const achados = analisarTexto("x.ts", texto);
  assert.equal(achados.length, 1);
  assert.equal(achados[0].linha, 2);
  assert.match(achados[0].motivo, /Anthropic/);
});

test("não imprime o valor encontrado", () => {
  const segredo = juntar("sk-", "ant-", "api03-", "b".repeat(40));
  const achados = analisarTexto("x.ts", `k = "${segredo}"`);
  assert.equal(JSON.stringify(achados).includes(segredo), false);
});

test("acha chave privada, token do GitHub e senha em URL de banco", () => {
  assert.equal(analisarTexto("a", juntar("-----BEGIN ", "RSA PRIVATE KEY-----")).length, 1);
  assert.equal(analisarTexto("a", juntar("gh", "p_", "A".repeat(36))).length, 1);
  assert.equal(
    analisarTexto("a", juntar("postgres", "://usuario:senha123@host:5432/banco")).length,
    1,
  );
});

test("acha atribuição suspeita com valor longo", () => {
  assert.equal(analisarTexto("a", juntar('api_key = "', "x".repeat(20), '"')).length, 1);
  assert.equal(analisarTexto("a", juntar("SECRET: '", "y".repeat(20), "'")).length, 1);
});

test("não acusa texto comum, nomes de variável sem valor e .env.example", () => {
  assert.equal(analisarTexto("a", "Use a chave da API só no servidor.").length, 0);
  assert.equal(analisarTexto("a", "ANTHROPIC_API_KEY=").length, 0);
  assert.equal(analisarTexto("a", "const token = ler();").length, 0);
  assert.equal(analisarTexto("a", "postgres://localhost:5432/banco").length, 0);
});

test("a marca de liberação ignora a linha", () => {
  const linha = `${juntar("gh", "p_", "A".repeat(36))} // segredos:ignorar`;
  assert.equal(analisarTexto("a", linha).length, 0);
});

test("barra arquivos que nunca devem ser versionados", () => {
  for (const nome of [
    ".env",
    "packages/server/.env",
    "packages/server/.env.production",
    "chave.pem",
    "android/app/release.keystore",
    "google-services.json",
    "firebase-adminsdk-abc123.json",
    "id_ed25519",
    "dados.sqlite",
    "tauri-signing.key",
    "pasta\\.env",
  ]) {
    assert.notEqual(nomeProibido(nome), null, `deveria barrar ${nome}`);
  }
});

test("deixa passar arquivos normais e o .env.example", () => {
  for (const nome of [
    ".env.example",
    "packages/server/.env.example",
    "README.md",
    "src/env.ts",
    "package.json",
  ]) {
    assert.equal(nomeProibido(nome), null, `não deveria barrar ${nome}`);
  }
});
