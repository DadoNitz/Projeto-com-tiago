import { NextResponse } from "next/server";

import { iaDisponivel, IANaoConfiguradaError } from "@/lib/ai";
import { IAIndisponivelError, RespostaInvalidaError } from "@/lib/ai/types";
import { ImagemInvalidaError, prepararParaLeitura } from "@/lib/images/process";
import { lerEtiqueta } from "@/server/services/label-reader.service";
import { requirePermission } from "@/server/session";

/**
 * Leitura de etiqueta por foto.
 *
 * Rota HTTP em vez de Server Action porque recebe multipart com um arquivo
 * grande, e streaming de upload e o que Route Handler faz bem.
 *
 * Nada e cadastrado aqui: a resposta e uma SUGESTAO que preenche o formulario.
 * Quem confirma e a pessoa (secao 14).
 */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    // Mesma autorizacao do cadastro: quem nao pode cadastrar nao gasta cota de
    // IA nem manda imagem para fora.
    await requirePermission("inventory:write");

    if (!iaDisponivel()) throw new IANaoConfiguradaError();

    const formulario = await request.formData();
    const arquivo = formulario.get("foto");
    const categoryId = formulario.get("categoryId");

    if (!(arquivo instanceof File)) {
      return NextResponse.json(
        { erro: "Envie a foto da etiqueta no campo 'foto'." },
        { status: 400 },
      );
    }

    const bruto = Buffer.from(await arquivo.arrayBuffer());
    const { imagem, mimeType } = await prepararParaLeitura(bruto);

    const sugestao = await lerEtiqueta({
      imagem,
      mimeType,
      categoryId: typeof categoryId === "string" && categoryId ? categoryId : undefined,
    });

    return NextResponse.json({ sugestao });
  } catch (erro) {
    if (
      erro instanceof ImagemInvalidaError ||
      erro instanceof IAIndisponivelError ||
      erro instanceof IANaoConfiguradaError ||
      erro instanceof RespostaInvalidaError
    ) {
      return NextResponse.json({ erro: erro.message }, { status: 422 });
    }

    console.error("[api/etiqueta]", erro);
    return NextResponse.json(
      { erro: "Nao foi possivel ler a etiqueta. Preencha os campos manualmente." },
      { status: 500 },
    );
  }
}
