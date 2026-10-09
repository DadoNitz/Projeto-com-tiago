"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icone } from "@/components/layout/icon";
import { NAVEGACAO_MOBILE } from "@/components/layout/nav-items";
import type { Role } from "@/generated/prisma/enums";
import { can } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

/**
 * Navegação inferior do celular (seção 33).
 *
 * Fica no rodapé porque é onde o polegar alcança. `pb-[env(safe-area-inset-bottom)]`
 * evita que a barra fique atrás do indicador de gestos do iPhone quando o app
 * roda instalado, em tela cheia.
 *
 * Alvos de toque de 56px de altura: abaixo disso o erro de toque cresce, e a
 * spec proíbe interface que dependa de precisão de mouse.
 */
export function BottomNav({ role }: { role: Role }) {
  const pathname = usePathname();

  const itens = NAVEGACAO_MOBILE.filter(
    (item) => !item.permissao || can(role, item.permissao),
  );

  return (
    <nav
      aria-label="Navegação"
      className="bg-card/90 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul
        className="grid px-2"
        style={{
          gridTemplateColumns: `repeat(${itens.length}, minmax(0, 1fr))`,
        }}
      >
        {itens.map((item) => {
          const ativo =
            item.href === "/dashboard"
              ? pathname === item.href
              : pathname.startsWith(item.href);
          const destaque = item.icone === "Plus";

          // O "+" sobe acima da barra: é a ação mais frequente e precisa ser
          // achada sem olhar. Os outros itens marcam a tela atual com a
          // pílula verde LED atrás do ícone.
          const conteudo = destaque ? (
            <>
              <span className="bg-primary text-primary-foreground -mt-7 flex size-14 items-center justify-center rounded-[20px] shadow-[0_10px_24px_-6px_rgba(0,0,0,0.35)] transition-transform duration-200 ease-[var(--ease-spring)] group-active:scale-90">
                <Icone nome={item.icone} className="size-7" />
              </span>
              <span className="sr-only">{item.titulo}</span>
            </>
          ) : (
            <>
              <span
                className={cn(
                  "flex h-8 w-14 items-center justify-center rounded-full transition-all duration-300 ease-[var(--ease-spring)] group-active:scale-90",
                  ativo ? "bg-led text-led-foreground" : "bg-transparent",
                )}
              >
                <Icone nome={item.icone} className="size-5" />
              </span>
              <span className="text-[11px] leading-none">{item.titulo}</span>
            </>
          );

          if (!item.disponivel) {
            return (
              <li key={item.href}>
                <span
                  aria-disabled
                  title={`Ainda não implementado (${item.fase})`}
                  className="text-muted-foreground/40 flex min-h-16 flex-col items-center justify-center gap-1"
                >
                  {conteudo}
                </span>
              </li>
            );
          }

          return (
            <li key={item.href} className="flex justify-center">
              <Link
                href={item.href}
                aria-current={ativo ? "page" : undefined}
                className={cn(
                  "group flex min-h-16 w-full flex-col items-center justify-center gap-1 transition-colors",
                  ativo
                    ? "text-foreground font-semibold"
                    : "text-muted-foreground",
                )}
              >
                {conteudo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
