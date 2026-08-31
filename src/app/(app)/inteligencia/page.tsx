import { Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { iaDisponivel } from "@/lib/ai";
import { can } from "@/lib/auth/permissions";
import { PERGUNTAS_SUGERIDAS } from "@/server/services/ai-chat.service";
import { requireContext } from "@/server/session";

import { ChatDoEstoque } from "./chat";

export const metadata: Metadata = { title: "Perguntar à IA" };
export const dynamic = "force-dynamic";

export default async function InteligenciaPage() {
  const ctx = await requireContext();
  if (!can(ctx.role, "ai:use")) redirect("/dashboard");

  const disponivel = iaDisponivel();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Perguntar à IA
        </h1>
        <p className="text-muted-foreground text-sm">
          O assistente consulta o banco por funções antes de responder. Ele
          nunca recebe o estoque inteiro nem decide compatibilidade por conta
          própria.
        </p>
      </div>

      {disponivel ? (
        <ChatDoEstoque sugestoes={PERGUNTAS_SUGERIDAS} />
      ) : (
        <div className="bg-card flex flex-col items-center gap-3 rounded-lg border px-6 py-16 text-center">
          <Sparkles className="text-muted-foreground size-10" aria-hidden />
          <p className="font-medium">IA não configurada</p>
          <p className="text-muted-foreground max-w-md text-sm">
            Defina <code className="text-xs">GEMINI_API_KEY</code> no ambiente
            para habilitar o assistente. A chave gratuita sai em
            aistudio.google.com/apikey. Todo o resto do sistema funciona sem ela.
          </p>
        </div>
      )}
    </div>
  );
}
