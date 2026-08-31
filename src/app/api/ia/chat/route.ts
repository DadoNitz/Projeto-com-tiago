import { NextResponse } from "next/server";

import { iaDisponivel, IANaoConfiguradaError } from "@/lib/ai";
import { IAIndisponivelError } from "@/lib/ai/types";
import { perguntarAoAssistente } from "@/server/services/ai-chat.service";
import { requirePermission } from "@/server/session";

/**
 * Chat sobre o estoque.
 *
 * Rota HTTP em vez de Server Action porque o laco de ferramentas pode levar
 * dezenas de segundos, e a rota permite declarar `maxDuration`.
 *
 * A IA so LE o estoque: as ferramentas sao somente leitura e nenhuma escreve
 * no banco. Nenhuma pergunta, por mais que peca, movimenta uma peca.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    await requirePermission("ai:use");

    if (!iaDisponivel()) throw new IANaoConfiguradaError();

    const ctx = await requirePermission("ai:use");
    const corpo: unknown = await request.json();

    const pergunta =
      typeof corpo === "object" && corpo !== null && "pergunta" in corpo
        ? String((corpo as { pergunta: unknown }).pergunta ?? "").trim()
        : "";

    if (pergunta.length < 2) {
      return NextResponse.json({ erro: "Escreva uma pergunta." }, { status: 400 });
    }
    if (pergunta.length > 2000) {
      return NextResponse.json(
        { erro: "Pergunta longa demais." },
        { status: 400 },
      );
    }

    const historicoBruto =
      typeof corpo === "object" && corpo !== null && "historico" in corpo
        ? (corpo as { historico: unknown }).historico
        : [];

    const historico = Array.isArray(historicoBruto)
      ? historicoBruto
          .filter(
            (item): item is { papel: "user" | "assistant"; texto: string } =>
              typeof item === "object" &&
              item !== null &&
              (item as { papel?: unknown }).papel !== undefined &&
              typeof (item as { texto?: unknown }).texto === "string",
          )
          .slice(-10)
      : [];

    const resposta = await perguntarAoAssistente({ pergunta, historico }, ctx);

    return NextResponse.json(resposta);
  } catch (erro) {
    if (
      erro instanceof IAIndisponivelError ||
      erro instanceof IANaoConfiguradaError
    ) {
      return NextResponse.json({ erro: erro.message }, { status: 422 });
    }

    console.error("[api/ia/chat]", erro);
    return NextResponse.json(
      { erro: "Nao foi possivel consultar o estoque agora." },
      { status: 500 },
    );
  }
}
