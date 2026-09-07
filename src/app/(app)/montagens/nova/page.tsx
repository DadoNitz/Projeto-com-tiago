import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { can } from "@/lib/auth/permissions";
import { listarPecasParaMontar } from "@/server/services/build.service";
import { requireContext } from "@/server/session";

import { Montador } from "./montador";

export const metadata: Metadata = { title: "Montar um PC" };
export const dynamic = "force-dynamic";

/**
 * Montagem manual: registrar um PC que já foi montado.
 *
 * A tela de sugestões responde "o que dá para montar?". Esta responde "montei
 * este PC, quais peças usei?" — que é a pergunta de quem está na bancada com a
 * máquina pronta e precisa que o estoque pare de dizer que aquelas peças estão
 * na prateleira.
 *
 * Exige `build:write` porque salvar aqui **altera o estoque**: as peças passam
 * para `IN_BUILD`. Quem só consulta não pode mover peça.
 */
export default async function NovaMontagemPage() {
  const ctx = await requireContext();
  if (!can(ctx.role, "build:write")) redirect("/montagens");

  const pecas = await listarPecasParaMontar();

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <Link
          href="/montagens"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Montagens
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
          Montar um PC
        </h1>
        <p className="text-muted-foreground text-sm">
          Marque as peças que você usou. Ao salvar, elas passam para “em
          montagem” no estoque e deixam de aparecer como disponíveis — e a
          página de cada peça passa a dizer em qual PC ela está.
        </p>
      </div>

      <Montador pecas={pecas} />
    </div>
  );
}
