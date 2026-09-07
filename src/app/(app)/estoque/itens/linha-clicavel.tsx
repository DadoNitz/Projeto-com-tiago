"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

/**
 * Linha da tabela em que o clique vale na linha inteira.
 *
 * A tabela do desktop já pintava a linha no `hover`, mas só a célula da peça
 * era link: clicar em "situação", "local" ou "valor" não fazia nada. O realce
 * prometia uma área clicável que não existia, e a lista de celular — onde o
 * cartão inteiro é link — se comportava diferente da de desktop.
 *
 * O link do nome continua no lugar. É ele que atende teclado, leitor de tela
 * e "abrir em nova aba"; este componente só estende o alcance do mouse, sem
 * inventar um `role="link"` que precisaria reimplementar tudo isso na mão.
 */
export function LinhaClicavel({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const router = useRouter();

  function aoClicar(evento: MouseEvent<HTMLTableRowElement>) {
    // Clique com modificador é pedido de nova aba ou nova janela, e quem
    // resolve isso é o link de verdade — não este atalho.
    if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) {
      return;
    }
    // O que caiu dentro de um link ou botão pertence a ele.
    if ((evento.target as HTMLElement).closest("a, button")) return;
    // Arrastar para selecionar texto termina em clique, e não é navegação.
    if (window.getSelection()?.toString()) return;

    router.push(href);
  }

  return (
    <tr onClick={aoClicar} className="hover:bg-muted/40 cursor-pointer">
      {children}
    </tr>
  );
}
