/**
 * Gera os icones do PWA a partir de um SVG, com sharp.
 *
 * Rodar apos alterar a marca:  node scripts/gerar-icones.mjs
 *
 * O icone "maskable" e desenhado a parte, com margem interna maior: o Android
 * recorta o icone em formatos variados (circulo, squircle) e, sem essa zona
 * de seguranca, o desenho aparece cortado nas bordas.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const SAIDA = path.join(process.cwd(), "public", "icons");

const FUNDO = "#0f172a";
const TRACO = "#e2e8f0";
const DESTAQUE = "#38bdf8";

/**
 * Glifo de chip/processador: representa a peca de hardware, que e o objeto
 * central do sistema.
 *
 * @param {number} tamanho lado do quadrado, em px
 * @param {number} escala fracao do lado ocupada pelo desenho (0..1)
 * @param {number} raio raio de canto do fundo, em px
 */
function svg(tamanho, escala, raio) {
  const corpo = tamanho * escala * 0.62;
  const centro = tamanho / 2;
  const x = centro - corpo / 2;
  const nucleo = corpo * 0.42;
  const perna = corpo * 0.2;
  const espessura = Math.max(2, corpo * 0.055);

  // Pinos do chip: 3 por lado.
  const pinos = [];
  for (let i = 0; i < 3; i += 1) {
    const passo = corpo / 4;
    const p = x + passo * (i + 1);
    // superior e inferior
    pinos.push(
      `<line x1="${p}" y1="${x - perna}" x2="${p}" y2="${x}"/>`,
      `<line x1="${p}" y1="${x + corpo}" x2="${p}" y2="${x + corpo + perna}"/>`,
      `<line x1="${x - perna}" y1="${p}" x2="${x}" y2="${p}"/>`,
      `<line x1="${x + corpo}" y1="${p}" x2="${x + corpo + perna}" y2="${p}"/>`,
    );
  }

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tamanho}" height="${tamanho}" viewBox="0 0 ${tamanho} ${tamanho}">
  <rect width="${tamanho}" height="${tamanho}" rx="${raio}" fill="${FUNDO}"/>
  <g stroke="${TRACO}" stroke-width="${espessura}" stroke-linecap="round" fill="none">
    ${pinos.join("\n    ")}
  </g>
  <rect x="${x}" y="${x}" width="${corpo}" height="${corpo}" rx="${corpo * 0.14}"
        fill="none" stroke="${TRACO}" stroke-width="${espessura * 1.2}"/>
  <rect x="${centro - nucleo / 2}" y="${centro - nucleo / 2}" width="${nucleo}" height="${nucleo}"
        rx="${nucleo * 0.18}" fill="${DESTAQUE}"/>
</svg>`);
}

async function png(nome, tamanho, escala, raio) {
  const destino = path.join(SAIDA, nome);
  await sharp(svg(tamanho, escala, raio)).png({ compressionLevel: 9 }).toFile(destino);
  console.log("gerado:", path.relative(process.cwd(), destino));
}

await mkdir(SAIDA, { recursive: true });

// Icones normais: desenho ocupa quase todo o quadrado.
await png("icon-192.png", 192, 1, 40);
await png("icon-512.png", 512, 1, 108);
await png("apple-touch-icon.png", 180, 1, 0); // iOS aplica o proprio recorte

// Maskable: desenho reduzido a 60% e fundo ate a borda (zona de seguranca).
await png("icon-maskable-512.png", 512, 0.6, 0);

// Favicon em SVG, nitido em qualquer tamanho.
// Convencao do Next: src/app/icon.svg vira o favicon automaticamente.
await writeFile(path.join(process.cwd(), "src", "app", "icon.svg"), svg(64, 1, 12));
console.log("gerado: src/app/icon.svg");
