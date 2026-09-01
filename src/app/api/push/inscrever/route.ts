import { NextResponse } from "next/server";

import { desinscrever, inscrever, pushDisponivel } from "@/server/services/push.service";
import { requireContext } from "@/server/session";

/**
 * Inscricao e cancelamento de notificacoes push.
 *
 * A chave publica VAPID e exposta pelo NEXT_PUBLIC_ e vai ao navegador de
 * proposito: ela e publica por definicao. A privada nunca sai do servidor.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const ctx = await requireContext();

  if (!pushDisponivel()) {
    return NextResponse.json(
      { erro: "Notificacoes nao configuradas neste servidor." },
      { status: 503 },
    );
  }

  const corpo = (await request.json()) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };

  if (!corpo.endpoint || !corpo.keys?.p256dh || !corpo.keys.auth) {
    return NextResponse.json({ erro: "Inscricao incompleta." }, { status: 400 });
  }

  await inscrever(
    {
      endpoint: corpo.endpoint,
      p256dh: corpo.keys.p256dh,
      auth: corpo.keys.auth,
      userAgent: request.headers.get("user-agent") ?? undefined,
    },
    ctx.userId,
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  await requireContext();

  const corpo = (await request.json()) as { endpoint?: string };
  if (!corpo.endpoint) {
    return NextResponse.json({ erro: "Informe o endpoint." }, { status: 400 });
  }

  await desinscrever(corpo.endpoint);
  return NextResponse.json({ ok: true });
}
