#!/usr/bin/env node
/**
 * Liga (ou desliga) a geração diária automática do briefing.
 *
 * Roda NO SEU COMPUTADOR, com a sua conta do GitHub (`gh auth login`). Lê a chave da Anthropic do
 * arquivo .env (que nunca vai para o Git) e a entrega ao GitHub como "segredo" do repositório:
 * o GitHub a guarda cifrada e só a mostra ao fluxo de publicação, nunca em logs nem no site.
 *
 * A chave passa por entrada padrão (stdin): não aparece na tela, nem na lista de processos, nem no histórico.
 *
 *   pnpm automacao:ativar      guarda o segredo e já pede o briefing de hoje
 *   pnpm automacao:desativar   apaga o segredo (o site continua no ar, só para de gerar briefing novo)
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const NOME_DO_SEGREDO = "ANTHROPIC_API_KEY";

function gh(args, opcoes = {}) {
  return spawnSync("gh", args, { encoding: "utf8", shell: false, ...opcoes });
}

function sair(mensagem, codigo = 1) {
  console.error(`✖ ${mensagem}`);
  process.exit(codigo);
}

/** Valor de NOME no texto de um .env. Nunca é impresso. */
export function lerDoEnv(texto, nome) {
  for (const linha of texto.split(/\r?\n/)) {
    const m = linha.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m?.[1] !== nome) continue;
    let valor = m[2].trim();
    if (/^(".*"|'.*')$/.test(valor)) valor = valor.slice(1, -1);
    return valor;
  }
  return "";
}

function main() {
  const desativar = process.argv.includes("--desativar");

  const auth = gh(["auth", "status"]);
  if (auth.error || auth.status !== 0) {
    sair("O GitHub CLI (gh) não está instalado ou você não entrou. Rode: gh auth login");
  }
  const repo = gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
  if (repo.status !== 0)
    sair("Não consegui descobrir o repositório. Rode este comando dentro da pasta do projeto.");
  const nome = repo.stdout.trim();

  if (desativar) {
    const r = gh(["secret", "delete", NOME_DO_SEGREDO, "--repo", nome]);
    if (r.status !== 0) sair("Não consegui apagar o segredo (talvez ele já não exista).");
    console.log(`✔ Segredo apagado de ${nome}. O site continua no ar; só não gera briefing novo.`);
    return;
  }

  if (!existsSync(".env")) sair("Não achei o arquivo .env nesta pasta (é onde a sua chave fica).");
  const chave = lerDoEnv(readFileSync(".env", "utf8"), NOME_DO_SEGREDO);
  if (!chave) sair(`O .env não tem ${NOME_DO_SEGREDO} preenchida.`);

  const guardar = gh(["secret", "set", NOME_DO_SEGREDO, "--repo", nome], { input: chave });
  if (guardar.status !== 0)
    sair(
      "O GitHub recusou o segredo. Confira se você tem permissão de administrador no repositório.",
    );
  console.log(`✔ Chave guardada como segredo de ${nome} (valor não exibido).`);

  const disparo = gh(["workflow", "run", "publicar.yml", "--repo", nome, "-f", "gerar=true"]);
  if (disparo.status !== 0) {
    console.log(
      "Segredo guardado, mas não consegui disparar a publicação agora. Ela roda sozinha amanhã às 06:00.",
    );
    return;
  }
  console.log(
    "✔ Pedi o briefing de hoje (só gera se ainda não existir). Acompanhe em: gh run watch",
  );
  console.log(
    "A partir de amanhã o briefing sai sozinho às 06:00, com trava de US$ 5 por mês e perfil econômico.",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
