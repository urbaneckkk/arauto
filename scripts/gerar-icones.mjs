#!/usr/bin/env node
/**
 * Gera os ícones PNG do app (sem dependências): um "núcleo" (anel e ponto azul-claro) sobre o
 * fundo azul-marinho do tema neutro. Uso: node scripts/gerar-icones.mjs [pasta-de-saida]
 * Padrão: packages/web/public
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";

const FUNDO = [11, 18, 32];
const AZUL = [125, 211, 252];
const SUPER = 3; // amostras por eixo, para suavizar as bordas

function cor(x, y, tamanho, margem) {
  const centro = tamanho / 2;
  const escala = (tamanho / 2 - margem) / 0.5; // 1 unidade = meio lado útil
  const dx = (x - centro) / escala;
  const dy = (y - centro) / escala;
  const d = Math.hypot(dx, dy);
  if (d <= 0.14) return AZUL; // ponto central
  if (d >= 0.6 && d <= 0.82) return AZUL; // anel
  return FUNDO;
}

function pixel(x, y, tamanho, margem) {
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < SUPER; i++) {
    for (let j = 0; j < SUPER; j++) {
      const c = cor(x + (i + 0.5) / SUPER, y + (j + 0.5) / SUPER, tamanho, margem);
      r += c[0];
      g += c[1];
      b += c[2];
    }
  }
  const n = SUPER * SUPER;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

function chunk(tipo, dados) {
  const cabeca = Buffer.alloc(8);
  cabeca.writeUInt32BE(dados.length, 0);
  cabeca.write(tipo, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(tipo, "ascii"), dados])), 0);
  return Buffer.concat([cabeca, dados, crc]);
}

function png(tamanho, margem) {
  const linhas = Buffer.alloc(tamanho * (tamanho * 3 + 1));
  for (let y = 0; y < tamanho; y++) {
    const inicio = y * (tamanho * 3 + 1);
    linhas[inicio] = 0; // filtro "nenhum"
    for (let x = 0; x < tamanho; x++) {
      const [r, g, b] = pixel(x, y, tamanho, margem);
      linhas[inicio + 1 + x * 3] = r;
      linhas[inicio + 2 + x * 3] = g;
      linhas[inicio + 3 + x * 3] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tamanho, 0);
  ihdr.writeUInt32BE(tamanho, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(linhas, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const pasta = process.argv[2] ?? "packages/web/public";
mkdirSync(pasta, { recursive: true });
// O ícone "maskable" precisa de folga: o sistema recorta as bordas em círculo ou "squircle".
const saidas = [
  ["icone-180.png", 180, 14],
  ["icone-192.png", 192, 14],
  ["icone-512.png", 512, 36],
  ["icone-512-maskable.png", 512, 96],
];
for (const [nome, tamanho, margem] of saidas) {
  writeFileSync(join(pasta, nome), png(tamanho, margem));
  console.log(`✔ ${nome}`);
}
