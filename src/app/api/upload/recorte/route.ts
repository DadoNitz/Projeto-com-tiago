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
 * Grava a versao sem fundo de uma foto ja enviada.
 *
 * Rota separada do upload comum porque o significado e outro: aqui nao nasce
 * uma foto nova, e sim uma SEGUNDA VERSAO de uma que ja existe. A original
 * continua intacta — remocao de fundo erra em peca escura sobre bancada
 * escura, e o operador precisa poder voltar atras.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    await requirePermission("inventory:write");

    const formulario = await request.formData();
    const arquivo = formulario.get("foto");
    const imageId = formulario.get("imageId");

    if (!(arquivo instanceof File) || typeof imageId !== "string") {
      return NextResponse.json(
        { erro: "Envie a imagem e o id da foto." },
        { status: 400 },
      );
    }

    // A foto pode ser de produto ou de unidade; procuramos nas duas.
    const daUnidade = await prisma.unitImage.findUnique({
      where: { id: imageId },
      select: { id: true, unitId: true },
    });
    const doProduto = daUnidade
      ? null
      : await prisma.productImage.findUnique({
          where: { id: imageId },
          select: { id: true, productId: true },
        });

    if (!daUnidade && !doProduto) {
      return NextResponse.json(
        { erro: "Foto nao encontrada." },
        { status: 404 },
      );
    }

    // O recorte passa pelo MESMO pipeline do upload comum: tipo conferido
    // pelos magic bytes, tamanho limitado, dimensoes normalizadas. O arquivo
    // chega do navegador do usuario, e nao ha razao para confiar mais nele so
    // porque nos geramos o original.
    const bruto = Buffer.from(await arquivo.arrayBuffer());
    const processada = await processarImagem(bruto, "recorte.png");

    const escopo = daUnidade ? "unidades" : "produtos";
    const chave = montarChave(escopo, imageId, "recorte");

    await storage().put(chave, processada.original, processada.contentType);

    if (daUnidade) {
      await prisma.unitImage.update({
        where: { id: imageId },
        data: { cutoutKey: chave },
      });
    } else {
      await prisma.productImage.update({
        where: { id: imageId },
        data: { cutoutKey: chave },
      });
    }

    return NextResponse.json({ url: `/api/imagens/${chave}` });
  } catch (erro) {
    if (erro instanceof ImagemInvalidaError) {
      return NextResponse.json({ erro: erro.message }, { status: 422 });
    }

    console.error("[api/upload/recorte]", erro);
    return NextResponse.json(
      { erro: "Nao foi possivel salvar o recorte." },
      { status: 500 },
    );
  }
}
