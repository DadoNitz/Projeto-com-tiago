import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { ImagemInvalidaError, montarChave, processarImagem } from "./process";

/**
 * Pipeline de imagem.
 *
 * O teste da transparência não é detalhe: a remoção de fundo gera um PNG com
 * canal alfa e o servidor converte para WebP antes de guardar. Se o alfa se
 * perdesse nessa conversão, o recurso continuaria "funcionando" — e entregaria
 * um recorte com fundo branco chapado, que é pior que não ter recorte.
 */

/**
 * PNG com transparência de verdade: um círculo sobre fundo vazio.
 *
 * Feito com SVG, cujo fundo já é transparente. A primeira versão deste
 * fixture usava `composite` com `dest-out` e produzia uma imagem OPACA — o
 * teste então "reprovava" um pipeline que estava certo. Fixture errado é pior
 * que teste ausente: ele acusa defeito onde não há.
 */
async function pngComTransparencia(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <circle cx="100" cy="100" r="80" fill="#dc2626"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe("processarImagem", () => {
  it("preserva a transparência ao converter para WebP", async () => {
    const entrada = await pngComTransparencia();
    const antes = await sharp(entrada).stats();
    expect(antes.isOpaque).toBe(false);

    const saida = await processarImagem(entrada, "recorte.png");
    const depois = await sharp(saida.original).stats();

    // Se isto virar `true`, o recorte estará sendo achatado contra um fundo
    // sólido e o recurso de remover fundo perde o sentido.
    expect(depois.isOpaque).toBe(false);

    const metadados = await sharp(saida.original).metadata();
    expect(metadados.hasAlpha).toBe(true);
    expect(metadados.format).toBe("webp");
  });

  it("mantém a transparência também na miniatura", async () => {
    // A miniatura é o que aparece na listagem; um fundo branco ali entregaria
    // a peça recortada sobre um quadrado branco no meio de cards escuros.
    const saida = await processarImagem(await pngComTransparencia(), "r.png");
    const thumb = await sharp(saida.thumbnail).metadata();
    expect(thumb.hasAlpha).toBe(true);
  });

  it("reduz imagem grande e informa as dimensões finais", async () => {
    const grande = await sharp({
      create: {
        width: 3000,
        height: 2000,
        channels: 3,
        background: { r: 10, g: 10, b: 10 },
      },
    })
      .jpeg()
      .toBuffer();

    const saida = await processarImagem(grande, "foto.jpg");

    expect(saida.largura).toBeLessThanOrEqual(2000);
    expect(saida.altura).toBeLessThanOrEqual(2000);
    // Proporção preservada: 3000x2000 cabe como 2000x1333.
    expect(saida.largura).toBe(2000);
    expect(saida.altura).toBe(1333);
  });

  it("recusa arquivo que não é imagem, mesmo com nome de imagem", async () => {
    // O tipo vem dos magic bytes, nunca da extensão nem do Content-Type.
    const texto = Buffer.from("<?php echo 'oi'; ?>", "utf8");
    await expect(processarImagem(texto, "foto.jpg")).rejects.toBeInstanceOf(
      ImagemInvalidaError,
    );
  });

  it("recusa arquivo vazio", async () => {
    await expect(
      processarImagem(Buffer.alloc(0), "vazio.jpg"),
    ).rejects.toBeInstanceOf(ImagemInvalidaError);
  });
});

describe("montarChave", () => {
  it("separa original, miniatura e recorte da mesma foto", () => {
    // As tres versoes convivem: a original nunca e substituida pelo recorte.
    expect(montarChave("unidades", "abc", "original")).toBe(
      "unidades/abc/original.webp",
    );
    expect(montarChave("unidades", "abc", "thumb")).toBe(
      "unidades/abc/thumb.webp",
    );
    expect(montarChave("unidades", "abc", "recorte")).toBe(
      "unidades/abc/recorte.webp",
    );
  });
});
