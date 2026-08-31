"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icone } from "@/components/layout/icon";
import { NAVEGACAO, type ItemDeNavegacao } from "@/components/layout/nav-items";
import type { Role } from "@/generated/prisma/enums";
import { can } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

/**
 * Barra lateral do desktop (seção 12).
 *
 * Permanente a partir de `lg`. No celular ela não existe — lá a navegação é a
 * barra inferior, alcançável com o polegar.
 */
export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();

  return (
    <aside className="bg-sidebar text-sidebar-foreground hidden w-64 shrink-0 flex-col border-r lg:flex">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md">
          <Icone nome="CircuitBoard" className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm leading-tight font-semibold">
            Estoque de Hardware
          </p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3" aria-label="Navegação principal">
        <ul className="space-y-1">
          {NAVEGACAO.map((item) => (
            <ItemSidebar
              key={item.href}
              item={item}
              pathname={pathname}
              role={role}
            />
          ))}
        </ul>
      </nav>
    </aside>
  );
}

function estaAtivo(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function ItemSidebar({
  item,
  pathname,
  role,
}: {
  item: ItemDeNavegacao;
  pathname: string;
  role: Role;
}) {
  // Item que o perfil não pode acessar some do menu. Mostrar um link que
  // sempre vai recusar só gera dúvida.
  if (item.permissao && !can(role, item.permissao)) return null;

  const filhosVisiveis = item.filhos?.filter(
    (filho) => !filho.permissao || can(role, filho.permissao),
  );

  const ativo = estaAtivo(pathname, item.href);

  return (
    <li>
      {item.disponivel ? (
        <Link
          href={item.href}
          aria-current={ativo ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
            "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
            ativo
              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              : "text-sidebar-foreground/80",
          )}
        >
          <Icone nome={item.icone} className="size-4 shrink-0" />
          {item.titulo}
        </Link>
      ) : (
        <span
          className="text-muted-foreground/60 flex cursor-default items-center gap-3 rounded-md px-3 py-2 text-sm"
          title={`Ainda não implementado (${item.fase})`}
        >
          <Icone nome={item.icone} className="size-4 shrink-0" />
          <span className="flex-1">{item.titulo}</span>
          <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px]">
            {item.fase}
          </span>
        </span>
      )}

      {ativo && filhosVisiveis && filhosVisiveis.length > 0 ? (
        <ul className="border-sidebar-border mt-1 ml-6 space-y-0.5 border-l pl-3">
          {filhosVisiveis.map((filho) => (
            <li key={filho.href}>
              {filho.disponivel ? (
                <Link
                  href={filho.href}
                  className={cn(
                    "block rounded-md px-2 py-1.5 text-sm transition-colors",
                    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    pathname === filho.href
                      ? "text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/70",
                  )}
                >
                  {filho.titulo}
                </Link>
              ) : (
                <span
                  className="text-muted-foreground/50 block px-2 py-1.5 text-sm"
                  title={`Ainda não implementado (${filho.fase})`}
                >
                  {filho.titulo}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
