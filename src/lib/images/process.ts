import "server-only";

import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

import { env } from "@/lib/env";
import { MIMES_ACEITOS } from "@/lib/storage/types";

/**
 * Pipeline de imagem do upload (seções 21 e 33).
 *
 * Fotos de celular chegam com 4 a 12 MB e 4000px de lado. Guardar isso como
 * veio, e depois servir numa listagem de 30 itens, torraria a franquia de
 * dados do usuário e travaria o aparelho.
 */

export class ImagemInvalidaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImagemInvalidaError";
  }
}

/** Lado maior do original guardado. Preserva legibilidade para OCR. */
const LADO_MAXIMO = 2000;
/** Lado maior da miniatura usada nas listagens. */
const LADO_THUMBNAIL = 400;

export interface ImagemProcessada {
  original: Buffer;
  thumbnail: Buffer;
  contentType: string;
  largura: number;
  altura: number;
}

/**
 * Valida e normaliza uma imagem enviada.
 *
 * O tipo é detectado pelos **bytes iniciais do arquivo**, não pelo
 * `Content-Type` que o cliente declarou. Cliente mente: um `.php` renomeado
 * para `.jpg` chega anunciando `image/jpeg`. Só os magic bytes dizem a verdade.
 */
export async function processarImagem(
  dados: Buffer,
  nomeArquivo: string,
): Promise<ImagemProcessada> {
  const limiteBytes = env().UPLOAD_MAX_MB * 1024 * 1024;

  if (dados.byteLength === 0) {
    throw new ImagemInvalidaError("Arquivo vazio.");
  }

  if (dados.byteLength > limiteBytes) {
    throw new ImagemInvalidaError(
      `Arquivo maior que o limite de ${env().UPLOAD_MAX_MB} MB.`,
    );
  }

  const tipo = await fileTypeFromBuffer(dados);

  if (!tipo || !MIMES_ACEITOS.includes(tipo.mime as (typeof MIMES_ACEITOS)[number])) {
    throw new ImagemInvalidaError(
      `"${nomeArquivo}" não é uma imagem suportada. Aceitos: JPEG, PNG, WebP e HEIC.`,
    );
  }

  let pipeline = sharp(dados, { failOn: "error" });

  let metadados;
  try {
    metadados = await pipeline.metadata();
  } catch {
    throw new ImagemInvalidaError(
      "Não foi possível ler a imagem. O arquivo pode estar corrompido.",
    );
  }

  // Fotos de celular vêm com orientação em EXIF; sem `rotate()` a imagem
  // aparece deitada. E o EXIF traz geolocalização, que não deve ir junto.
  pipeline = pipeline.rotate();

  const precisaReduzir =
    (metadados.width ?? 0) > LADO_MAXIMO || (metadados.height ?? 0) > LADO_MAXIMO;

  const original = await pipeline
    .clone()
    .resize(
      precisaReduzir
        ? { width: LADO_MAXIMO, height: LADO_MAXIMO, fit: "inside" }
        : undefined,
    )
    // WebP com qualidade alta: mantém detalhe de texto pequeno em etiqueta,
    // que é o que o OCR precisa, com metade do tamanho de um JPEG equivalente.
    .webp({ quality: 88 })
    .toBuffer();

  const thumbnail = await pipeline
    .clone()
    .resize({ width: LADO_THUMBNAIL, height: LADO_THUMBNAIL, fit: "inside" })
    .webp({ quality: 72 })
    .toBuffer();

  const finais = await sharp(original).metadata();

  return {
    original,
    thumbnail,
    contentType: "image/webp",
    largura: finais.width ?? 0,
    altura: finais.height ?? 0,
  };
}

/**
 * Prepara a foto de etiqueta para a leitura por IA.
 *
 * Aqui a prioridade é oposta à da listagem: legibilidade acima de tamanho.
 * Reduzir demais apaga o serial em fonte pequena, que é justamente o dado mais
 * difícil e mais valioso de extrair.
 */
export async function prepararParaLeitura(dados: Buffer): Promise<{
  imagem: Buffer;
  mimeType: string;
}> {
  const tipo = await fileTypeFromBuffer(dados);
  if (!tipo || !MIMES_ACEITOS.includes(tipo.mime as (typeof MIMES_ACEITOS)[number])) {
    throw new ImagemInvalidaError("Arquivo não é uma imagem suportada.");
  }

  const imagem = await sharp(dados)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();

  return { imagem, mimeType: "image/jpeg" };
}

/** Chave de storage. Inclui o id para nunca colidir entre uploads. */
export function montarChave(
  escopo: "produtos" | "unidades" | "etiquetas",
  id: string,
  sufixo: "original" | "thumb" | "recorte",
): string {
  return `${escopo}/${id}/${sufixo}.webp`;
}
