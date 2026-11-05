#!/usr/bin/env node
/**
 * Barreira contra segredos no repositório. Roda no `pnpm verificar` e no CI.
 *
 * Olha os arquivos versionados (e os novos, ainda não versionados) e falha se achar:
 *  - arquivo que nunca deve ir para o Git (.env, chaves, certificados, credenciais);
 *  - texto com cara de segredo (chaves de API, tokens, chave privada, senha em URL).
 *
 * Nunca imprime o valor encontrado, só o arquivo, a linha e o tipo.
 * Para liberar uma linha que é falso positivo, escreva `segredos:ignorar` na mesma linha.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";

const NOMES_PROIBIDOS = [
  {
    motivo: "arquivo .env (só .env.example é permitido)",
    teste: (c) => /(^|\/)\.env(\.[^/]+)?$/.test(c) && !/(^|\/)\.env\.example$/.test(c),
  },
  {
    motivo: "chave ou certificado",
    teste: (c) => /\.(pem|key|p12|pfx|jks|keystore)$/i.test(c),
  },
  {
    motivo: "credencial do Firebase ou do Google",
    teste: (c) =>
      /(^|\/)(google-services\.json|GoogleService-Info\.plist|firebase-adminsdk[^/]*\.json|service-account[^/]*\.json)$/i.test(
        c,
      ),
  },
  {
    motivo: "chave SSH",
    teste: (c) => /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/.test(c),
  },
  {
    motivo: "chave de assinatura do Tauri",
    teste: (c) => /(^|\/)tauri-signing[^/]*$/i.test(c),
  },
  {
    motivo: "banco de dados local",
    teste: (c) => /\.(sqlite3?|db)$/i.test(c),
  },
];

const PADROES = [
  ["chave da Anthropic", /sk-ant-[A-Za-z0-9_-]{16,}/],
  ["chave privada", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["chave da AWS", /\b(AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["token do GitHub", /\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/],
  ["token do Slack", /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ["chave de API do Google", /\bAIza[0-9A-Za-z_-]{30,}/],
  ["JWT", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  [
    "URL de banco com senha",
    /\b(postgres(ql)?|mysql|mongodb(\+srv)?|redis):\/\/[^\s:@/]+:[^\s@/]+@/i,
  ],
  [
    "atribuição suspeita (chave, token ou senha com valor)",
    /\b(api[_-]?key|secret|token|passw(or)?d|senha)\b["']?\s*[:=]\s*["'][^"'\s]{16,}["']/i,
  ],
];

const EXTENSOES_BINARIAS = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|zip|gz)$/i;
const TAMANHO_MAXIMO = 2 * 1024 * 1024;
const MARCA_DE_LIBERACAO = "segredos:ignorar";

export function nomeProibido(caminho) {
  const normalizado = caminho.replaceAll("\\", "/");
  return NOMES_PROIBIDOS.find((regra) => regra.teste(normalizado))?.motivo ?? null;
}

export function analisarTexto(caminho, texto) {
  const achados = [];
  const linhas = texto.split(/\r?\n/);
  linhas.forEach((linha, indice) => {
    if (linha.includes(MARCA_DE_LIBERACAO)) return;
    for (const [motivo, padrao] of PADROES) {
      if (padrao.test(linha)) {
        achados.push({ caminho, linha: indice + 1, motivo });
      }
    }
  });
  return achados;
}

function arquivosDoRepositorio() {
  const saida = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return [...new Set(saida.split("\0").filter(Boolean))];
}

function main() {
  const problemas = [];
  const arquivos = arquivosDoRepositorio();

  for (const caminho of arquivos) {
    const motivo = nomeProibido(caminho);
    if (motivo) {
      problemas.push(`${caminho}: ${motivo}`);
      continue;
    }
    if (EXTENSOES_BINARIAS.test(caminho)) continue;
    try {
      if (statSync(caminho).size > TAMANHO_MAXIMO) continue;
      for (const achado of analisarTexto(caminho, readFileSync(caminho, "utf8"))) {
        problemas.push(`${achado.caminho}:${achado.linha}: possível segredo (${achado.motivo})`);
      }
    } catch {
      // Arquivo apagado entre a listagem e a leitura: nada a verificar.
    }
  }

  if (problemas.length > 0) {
    console.error("✖ Segredos ou arquivos proibidos encontrados (valores não exibidos):\n");
    for (const problema of problemas) console.error(`  - ${problema}`);
    console.error(
      "\nSe for um segredo de verdade: NÃO basta apagar do arquivo. Considere-o comprometido, revogue-o e gere outro.",
    );
    process.exitCode = 1;
    return;
  }
  console.log(`✔ Nenhum segredo encontrado em ${arquivos.length} arquivos.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
