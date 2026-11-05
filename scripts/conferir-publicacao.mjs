#!/usr/bin/env node
/**
 * Última conferência antes de pôr o site no ar: olha o que está na pasta que será publicada
 * (packages/web/dist) e falha se houver algo que não devia estar ali.
 *
 * Por quê: no GitHub Pages TUDO que está na pasta fica acessível por endereço. Aqui só pode haver
 * o app compilado e os briefings públicos: nada de .env, mapa de código, estado do pipeline,
 * chave ou texto com cara de segredo.
 *
 * Uso: node scripts/conferir-publicacao.mjs packages/web/dist
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { analisarTexto, nomeProibido } from "./verificar-segredos.mjs";

const EXTENSOES_PERMITIDAS = new Set([
  ".html",
  ".js",
  ".css",
  ".json",
  ".webmanifest",
  ".svg",
  ".png",
  ".woff",
  ".woff2",
  ".txt",
]);
const NOMES_PERMITIDOS_SEM_EXTENSAO = new Set([".nojekyll"]);
const EXTENSOES_BINARIAS = new Set([".png", ".woff", ".woff2"]);
const OBRIGATORIOS = ["index.html", "sw.js", "manifest.webmanifest", "favicon.svg"];
const LIMITE_TOTAL_BYTES = 40 * 1024 * 1024;

function listar(pasta) {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = join(pasta, entrada.name);
    return entrada.isDirectory() ? listar(caminho) : [caminho];
  });
}

function extensao(nome) {
  const ponto = nome.lastIndexOf(".");
  return ponto <= 0 ? "" : nome.slice(ponto).toLowerCase();
}

/** Devolve a lista de problemas (vazia = pode publicar). */
export function problemasDaPublicacao(pasta) {
  const problemas = [];
  if (!existsSync(pasta)) return [`a pasta ${pasta} não existe (faltou compilar o app?)`];
  const arquivos = listar(pasta);
  let total = 0;

  for (const caminho of arquivos) {
    const rel = relative(pasta, caminho).replaceAll("\\", "/");
    const nome = rel.split("/").at(-1) ?? rel;
    const ext = extensao(nome);
    total += statSync(caminho).size;

    const proibido = nomeProibido(rel);
    if (proibido) problemas.push(`${rel}: ${proibido}`);
    if (ext === ".map") problemas.push(`${rel}: mapa de código (expõe o código-fonte)`);
    if (!EXTENSOES_PERMITIDAS.has(ext) && !NOMES_PERMITIDOS_SEM_EXTENSAO.has(nome)) {
      problemas.push(`${rel}: tipo de arquivo que não deveria ser publicado`);
      continue;
    }
    // JSON só é esperado nos briefings públicos; qualquer outro (ex.: estado.json) é suspeito.
    if (ext === ".json" && !rel.startsWith("briefing/")) {
      problemas.push(`${rel}: JSON fora de briefing/`);
    }
    if (/(^|\/)(estado|execucao)[^/]*\.json$/i.test(rel)) {
      problemas.push(`${rel}: estado interno do pipeline`);
    }
    if (!EXTENSOES_BINARIAS.has(ext)) {
      for (const achado of analisarTexto(rel, readFileSync(caminho, "utf8"))) {
        problemas.push(`${rel}:${achado.linha}: possível segredo (${achado.motivo})`);
      }
    }
  }

  for (const nome of OBRIGATORIOS) {
    if (!existsSync(join(pasta, nome))) problemas.push(`${nome}: arquivo obrigatório ausente`);
  }
  if (total > LIMITE_TOTAL_BYTES) problemas.push(`tamanho total ${total} bytes passa do limite`);
  return problemas;
}

function main() {
  const pasta = process.argv[2];
  if (!pasta) {
    console.error("Uso: node scripts/conferir-publicacao.mjs <pasta>");
    process.exit(1);
  }
  const problemas = problemasDaPublicacao(pasta);
  if (problemas.length > 0) {
    console.error("✖ A publicação tem problemas (valores não exibidos):\n");
    for (const problema of problemas) console.error(`  - ${problema}`);
    process.exit(1);
  }
  console.log(`✔ Publicação conferida: ${listar(pasta).length} arquivos, nada suspeito.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
