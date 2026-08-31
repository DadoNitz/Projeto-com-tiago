"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Botão flutuante de adicionar peça.
 *
 * Fica no canto inferior direito, que é onde o polegar direito alcança sem
 * reposicionar a mão — cadastrar é a ação mais frequente do sistema, segundo a
 * seção 33.
 *
 * Detalhes que importam:
 * - `bottom-20` no celular sobe o botão acima da barra de navegação inferior,
 *   para que um não cubra o outro;
 * - `env(safe-area-inset-bottom)` evita o indicador de gestos do iPhone quando
 *   o app roda instalado;
 * - some na própria tela de cadastro, onde seria um convite a recomeçar o que
 *   já se está fazendo.
 */
export function BotaoAdicionar() {
  const pathname = usePathname();

  if (pathname.startsWith("/estoque/novo")) return null;

  return (
    <Link
      href="/estoque/novo"
      aria-label="Adicionar peça ao estoque"
      className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring fixed right-4 bottom-20 z-40 flex size-14 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none lg:bottom-6"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <Plus className="size-6" aria-hidden />
    </Link>
  );
}
