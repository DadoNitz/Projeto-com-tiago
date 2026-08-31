import { NextResponse } from "next/server";

import { iaDisponivel, IANaoConfiguradaError } from "@/lib/ai";
import { IAIndisponivelError, RespostaInvalidaError } from "@/lib/ai/types";
import {
  gerarAnuncioDeMontagem,
  gerarAnuncioDeUnidade,
} from "@/server/services/listing.service";
import { RegraDeNegocioError } from "@/server/services/errors";
import { requirePermission } from "@/server/session";

/**
 * Geracao de anuncio de venda.
 *
 * O texto sai como RASCUNHO. Nada e publicado automaticamente em lugar nenhum:
 * o sistema nao tem, e nao deve ter, credencial de publicacao em marketplace.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const CANAIS = [
  "FACEBOOK_MARKETPLACE",
  "OLX",
  "MERCADO_LIVRE",
  "WHATSAPP",
  "INSTAGRAM",
  "OUTRO",
] as const;

export async function POST(request: Request) {
  try {
    const ctx = await requirePermission("ai:use");
    if (!iaDisponivel()) throw new IANaoConfiguradaError();

    const corpo = (await request.json()) as {
      unitId?: string;
      buildId?: string;
      canal?: string;
      preco?: number;
    };

    const canal = CANAIS.includes(corpo.canal as (typeof CANAIS)[number])
      ? (corpo.canal as (typeof CANAIS)[number])
      : "FACEBOOK_MARKETPLACE";

    if (!corpo.unitId && !corpo.buildId) {
      return NextResponse.json(
        { erro: "Informe a peca ou a montagem a anunciar." },
        { status: 400 },
      );
    }

    const anuncio = corpo.buildId
      ? await gerarAnuncioDeMontagem(
          { buildId: corpo.buildId, canal, preco: corpo.preco },
          ctx,
        )
      : await gerarAnuncioDeUnidade(
          { unitId: corpo.unitId!, canal, preco: corpo.preco },
          ctx,
        );

    return NextResponse.json({ anuncio });
  } catch (erro) {
    if (
      erro instanceof IAIndisponivelError ||
      erro instanceof IANaoConfiguradaError ||
      erro instanceof RespostaInvalidaError ||
      erro instanceof RegraDeNegocioError
    ) {
      return NextResponse.json({ erro: erro.message }, { status: 422 });
    }

    console.error("[api/ia/anuncio]", erro);
    return NextResponse.json(
      { erro: "Nao foi possivel gerar o anuncio agora." },
      { status: 500 },
    );
  }
}
