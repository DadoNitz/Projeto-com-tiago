import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { can } from "@/lib/auth/permissions";
import { listarUsuarios } from "@/server/services/user.service";
import { requireContext } from "@/server/session";

import { ListaDeUsuarios } from "./lista";

export const metadata: Metadata = { title: "Usuários" };
export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const ctx = await requireContext();
  if (!can(ctx.role, "user:manage")) redirect("/configuracoes");

  const usuarios = await listarUsuarios();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href="/configuracoes"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Configurações
      </Link>

      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Usuários
        </h1>
        <p className="text-muted-foreground text-sm">
          Quem tem acesso ao sistema e o que cada um pode fazer.
        </p>
      </div>

      <ListaDeUsuarios usuarios={usuarios} meuId={ctx.userId} />

      <p className="text-muted-foreground text-xs leading-relaxed">
        Contas desativadas não conseguem entrar, mas continuam aparecendo no
        histórico e na auditoria — apagá-las deixaria movimentações sem autor.
      </p>
    </div>
  );
}
