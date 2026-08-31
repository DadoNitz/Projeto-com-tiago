import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  ImagemInvalidaError,
  montarChave,
  processarImagem,
} from "@/lib/images/process";
import { storage } from "@/lib/storage";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/session";

/**
 * Upload de foto de peca.
 *
 * Rota HTTP porque recebe multipart com arquivo grande, que e o que Route
 * Handler faz bem.
 *
 * Duas garantias que a rota precisa dar (secao 21):
 * - o tipo do arquivo e detectado pelos BYTES, nunca pelo Content-Type que o
 *   cliente declarou;
 * - a chave gravada e gerada pelo servidor, nunca vinda do cliente, senao um
 *   nome manipulado poderia sobrescrever a foto de outra peca.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    await requirePermission("inventory:write");

    const formulario = await request.formData();
    const arquivo = formulario.get("foto");
    const productId = formulario.get("productId");
    const unitId = formulario.get("unitId");
    const ehEtiqueta = formulario.get("etiqueta") === "1";

    if (!(arquivo instanceof File)) {
      return NextResponse.json(
        { erro: "Envie a imagem no campo 'foto'." },
        { status: 400 },
      );
    }

    if (typeof productId !== "string" && typeof unitId !== "string") {
      return NextResponse.json(
        { erro: "Informe a peca ou o produto." },
        { status: 400 },
      );
    }

    const bruto = Buffer.from(await arquivo.arrayBuffer());
    const processada = await processarImagem(bruto, arquivo.name);

    const escopo = typeof unitId === "string" ? "unidades" : "produtos";
    const id = randomUUID();

    const chaveOriginal = montarChave(escopo, id, "original");
    const chaveThumb = montarChave(escopo, id, "thumb");

    const driver = storage();
    await Promise.all([
      driver.put(chaveOriginal, processada.original, processada.contentType),
      driver.put(chaveThumb, processada.thumbnail, processada.contentType),
    ]);

    const comum = {
      storageKey: chaveOriginal,
      thumbnailKey: chaveThumb,
      fileName: arquivo.name.slice(0, 200),
      mimeType: processada.contentType,
      sizeBytes: processada.original.byteLength,
      width: processada.largura,
      height: processada.altura,
    };

    if (typeof unitId === "string") {
      // A primeira foto da unidade vira a principal automaticamente: exigir um
      // clique a mais para marcar a unica foto seria burocracia.
      const jaTem = await prisma.unitImage.count({ where: { unitId } });
      const imagem = await prisma.unitImage.create({
        data: {
          ...comum,
          unitId,
          isLabel: ehEtiqueta,
          isPrimary: jaTem === 0,
          sortOrder: jaTem,
        },
        select: { id: true },
      });
      return NextResponse.json({
        id: imagem.id,
        url: `/api/imagens/${chaveThumb}`,
        chave: chaveOriginal,
      });
    }

    const jaTem = await prisma.productImage.count({
      where: { productId: productId as string },
    });
    const imagem = await prisma.productImage.create({
      data: {
        ...comum,
        productId: productId as string,
        isPrimary: jaTem === 0,
        sortOrder: jaTem,
      },
      select: { id: true },
    });

    return NextResponse.json({
      id: imagem.id,
      url: `/api/imagens/${chaveThumb}`,
      chave: chaveOriginal,
    });
  } catch (erro) {
    if (erro instanceof ImagemInvalidaError) {
      return NextResponse.json({ erro: erro.message }, { status: 422 });
    }

    console.error("[api/upload]", erro);
    return NextResponse.json(
      { erro: "Nao foi possivel enviar a foto." },
      { status: 500 },
    );
  }
}
