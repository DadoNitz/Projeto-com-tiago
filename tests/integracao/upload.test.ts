import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  ImagemInvalidaError,
  montarChave,
  processarImagem,
} from "@/lib/images/process";

/**
 * Pipeline de imagem.
 *
 * O que se verifica aqui e a parte que protege o sistema: tipo detectado pelos
 * bytes (nao pelo que o cliente declara), tamanho limitado, EXIF removido e
 * miniatura gerada.
 */
describe("processamento de imagem", () => {
  async function jpegDe(largura: number, altura: number): Promise<Buffer> {
    return sharp({
      create: {
        width: largura,
        height: altura,
        channels: 3,
        background: { r: 120, g: 140, b: 160 },
      },
    })
      .jpeg()
      .toBuffer();
  }

  it("reduz imagem grande e gera miniatura", async () => {
    // Foto de celular tipica: 4000px de lado.
    const original = await jpegDe(4000, 3000);
    const processada = await processarImagem(original, "foto.jpg");

    expect(processada.largura).toBeLessThanOrEqual(2000);
    expect(processada.altura).toBeLessThanOrEqual(2000);
    expect(processada.contentType).toBe("image/webp");

    const thumb = await sharp(processada.thumbnail).metadata();
    expect(thumb.width).toBeLessThanOrEqual(400);

    // A versao guardada precisa ser menor que a original.
    expect(processada.original.byteLength).toBeLessThan(original.byteLength);
    expect(processada.thumbnail.byteLength).toBeLessThan(
      processada.original.byteLength,
    );
  });

  it("nao amplia imagem pequena", async () => {
    const original = await jpegDe(300, 200);
    const processada = await processarImagem(original, "pequena.jpg");
    expect(processada.largura).toBe(300);
  });

  it("recusa arquivo que nao e imagem, mesmo com nome de imagem", async () => {
    // O ataque classico: um executavel renomeado para .jpg chega anunciando
    // image/jpeg. So os magic bytes dizem a verdade.
    const falso = Buffer.from("MZ\x90\x00 isto nao e uma imagem", "utf8");
    await expect(processarImagem(falso, "virus.jpg")).rejects.toBeInstanceOf(
      ImagemInvalidaError,
    );
  });

  it("recusa arquivo vazio", async () => {
    await expect(
      processarImagem(Buffer.alloc(0), "vazio.jpg"),
    ).rejects.toBeInstanceOf(ImagemInvalidaError);
  });

  it("remove os metadados EXIF", async () => {
    // EXIF de foto de celular carrega geolocalizacao. Ela nao deve sair junto
    // com a imagem de uma peca.
    const comExif = await sharp({
      create: {
        width: 500,
        height: 500,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .withExif({ IFD0: { Copyright: "teste", Software: "camera" } })
      .jpeg()
      .toBuffer();

    const processada = await processarImagem(comExif, "com-exif.jpg");
    const metadados = await sharp(processada.original).metadata();
    expect(metadados.exif).toBeUndefined();
  });

  it("gera chave que separa escopo e id", () => {
    const chave = montarChave("unidades", "abc123", "thumb");
    expect(chave).toBe("unidades/abc123/thumb.webp");
  });
});
