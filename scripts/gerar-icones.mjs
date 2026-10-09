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

// Identidade "Bancada": grafite, verde LED e papel.
const FUNDO = "#141617";
const LED = "#C5F23C";
const PAPEL = "#F2F1EC";

/**
 * Marca da Bancada: tampo e pés da bancada em verde LED, com os pinos de um
 * chip em cima. Desenhada numa grade de 56 e escalada para o tamanho pedido.
 *
 * @param {number} tamanho lado do quadrado, em px
 * @param {number} escala fracao do lado ocupada pelo desenho (0..1)
 * @param {number} raio raio de canto do fundo, em px
 */
function svg(tamanho, escala, raio) {
  const k = (tamanho * escala) / 56;
  const off = (tamanho - 56 * k) / 2;
  const r = (x, y, w, h, rr, cor) =>
    `<rect x="${off + x * k}" y="${off + y * k}" width="${w * k}" height="${h * k}" rx="${rr * k}" fill="${cor}"/>`;
  const pinos = [17, 24, 31, 38].map((x) => r(x, 13, 3, 6, 1, PAPEL)).join("\n  ");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tamanho}" height="${tamanho}" viewBox="0 0 ${tamanho} ${tamanho}">
  <rect width="${tamanho}" height="${tamanho}" rx="${raio}" fill="${FUNDO}"/>
  ${r(11, 22, 34, 7, 2, LED)}
  ${r(15, 29, 5, 15, 1.5, LED)}
  ${r(36, 29, 5, 15, 1.5, LED)}
  ${pinos}
</svg>`);
}

async function png(nome, tamanho, escala, raio) {
  const destino = path.join(SAIDA, nome);
  await sharp(svg(tamanho, escala, raio)).png({ compressionLevel: 9 }).toFile(destino);
  console.log("gerado:", path.relative(process.cwd(), destino));
}

await mkdir(SAIDA, { recursive: true });

// Icones normais: desenho ocupa quase todo o quadrado.
await png("icon-192.png", 192, 1, 50);
await png("icon-512.png", 512, 1, 137);
await png("apple-touch-icon.png", 180, 1, 0); // iOS aplica o proprio recorte

// Maskable: desenho reduzido a 60% e fundo ate a borda (zona de seguranca).
await png("icon-maskable-512.png", 512, 0.6, 0);

// Favicon em SVG, nitido em qualquer tamanho.
// Convencao do Next: src/app/icon.svg vira o favicon automaticamente.
await writeFile(path.join(process.cwd(), "src", "app", "icon.svg"), svg(64, 1, 17));
console.log("gerado: src/app/icon.svg");
