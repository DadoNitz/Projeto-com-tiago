"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAVEGACAO } from "./nav-items";
import { Icone } from "./icon";
import { can } from "@/lib/auth/permissions";
import type { Role } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

export function SectionNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const secao = NAVEGACAO.find((item) =>
    item.filhos?.some(
      (filho) =>
        pathname === filho.href || pathname.startsWith(`${filho.href}/`),
    ),
  );
  const filhos = secao?.filhos?.filter(
    (item) => item.disponivel && (!item.permissao || can(role, item.permissao)),
  );
  if (!filhos?.length) return null;
  return (
    <nav
      aria-label={`Seções de ${secao?.titulo}`}
      className="mx-auto mb-5 flex max-w-7xl gap-2 overflow-x-auto pb-1 lg:hidden"
    >
      {filhos.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={pathname === item.href ? "page" : undefined}
          className={cn(
            "flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-medium",
            pathname === item.href
              ? "border-primary/20 bg-primary/8 text-primary"
              : "bg-card text-muted-foreground",
          )}
        >
          <Icone nome={item.icone} className="size-4" />
          {item.titulo}
        </Link>
      ))}
    </nav>
  );
}
