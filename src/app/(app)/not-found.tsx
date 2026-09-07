import { PackageX } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

/**
 * Destino do `notFound()` das telas de peça.
 *
 * Ele já era chamado em `estoque/itens/[id]` sem que existisse esta fronteira,
 * então um código interno inválido — QR Code de peça já vendida, link antigo
 * no WhatsApp — caía na página 404 padrão do Next, sem menu e em inglês.
 */
export default function NaoEncontrado() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-xl">
        <PackageX className="size-6" aria-hidden />
      </div>

      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Não encontramos esta peça</h1>
        <p className="text-muted-foreground text-sm">
          O endereço não existe ou a unidade saiu do estoque. Se veio de um QR
          Code, a etiqueta pode ser de uma peça já vendida.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <Link
          href="/estoque/itens"
          className={buttonVariants({ className: "h-11" })}
        >
          Ver o estoque
        </Link>
        <Link
          href="/dashboard"
          className={buttonVariants({ variant: "outline", className: "h-11" })}
        >
          Ir para o dashboard
        </Link>
      </div>
    </div>
  );
}
