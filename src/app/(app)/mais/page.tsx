import type { Metadata } from "next";
import Link from "next/link";

import { Icone } from "@/components/layout/icon";
import { NAVEGACAO } from "@/components/layout/nav-items";
import { can } from "@/lib/auth/permissions";
import { requireContext } from "@/server/session";

export const metadata: Metadata = { title: "Mais" };

/**
 * Menu completo do celular.
 *
 * A barra inferior cabe cinco itens; o resto da navegacao vive aqui. Itens
 * ainda nao implementados aparecem apagados, com a fase a que pertencem, em
 * vez de sumirem — assim da para ver a forma do sistema sem cair em pagina
 * vazia.
 */
export default async function MaisPage() {
  const ctx = await requireContext();

  const itens = NAVEGACAO.filter(
    (item) => !item.permissao || can(ctx.role, item.permissao),
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Mais</h1>

      <ul className="bg-card divide-y overflow-hidden rounded-lg border">
        {itens.map((item) =>
          item.disponivel ? (
            <li key={item.href}>
              <Link
                href={item.href}
                className="hover:bg-muted/50 flex min-h-14 items-center gap-3 px-4 py-3 transition-colors"
              >
                <Icone nome={item.icone} className="text-muted-foreground size-5" />
                <span className="flex-1 text-sm">{item.titulo}</span>
              </Link>
            </li>
          ) : (
            <li
              key={item.href}
              className="text-muted-foreground/60 flex min-h-14 items-center gap-3 px-4 py-3"
            >
              <Icone nome={item.icone} className="size-5" />
              <span className="flex-1 text-sm">{item.titulo}</span>
              <span className="bg-muted rounded px-1.5 py-0.5 text-[10px]">
                {item.fase}
              </span>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
