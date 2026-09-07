import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Seu espaço de trabalho
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Todas as ferramentas, a um toque de distância.
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {itens.map((item) =>
          item.disponivel ? (
            <li
              key={item.href}
              className="bg-card overflow-hidden rounded-2xl border"
            >
              <Link
                href={item.href}
                className="hover:bg-muted/50 flex min-h-14 items-center gap-3 px-4 py-3 transition-colors"
              >
                <span className="bg-primary/8 text-primary flex size-10 items-center justify-center rounded-xl">
                  <Icone nome={item.icone} className="size-5" />
                </span>
                <span className="flex-1 text-sm font-semibold">
                  {item.titulo}
                </span>
                <ChevronRight
                  className="text-muted-foreground size-4"
                  aria-hidden
                />
              </Link>
              {item.filhos
                ?.filter(
                  (filho) =>
                    filho.disponivel &&
                    filho.href !== item.href &&
                    (!filho.permissao || can(ctx.role, filho.permissao)),
                )
                .map((filho) => (
                  <Link
                    key={filho.href}
                    href={filho.href}
                    className="text-muted-foreground hover:bg-muted/50 flex min-h-11 items-center gap-2 border-t px-4 py-2 text-sm"
                  >
                    <Icone nome={filho.icone} className="size-4" />
                    <span className="flex-1">{filho.titulo}</span>
                    <ChevronRight className="size-3" aria-hidden />
                  </Link>
                ))}
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
