import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

/**
 * 404 de endereço que não casa com rota nenhuma.
 *
 * Fica na raiz porque o Next só usa a fronteira da raiz para URL sem rota; a
 * de dentro de `(app)` atende o `notFound()` das telas de peça. Aqui não há
 * menu nem sessão garantida, então o único caminho oferecido é a entrada.
 */
export default function NaoEncontradoGlobal() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-muted-foreground font-mono text-sm">404</p>

      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Página não encontrada</h1>
        <p className="text-muted-foreground max-w-sm text-sm">
          Este endereço não existe no sistema.
        </p>
      </div>

      <Link href="/dashboard" className={buttonVariants({ className: "h-11" })}>
        Voltar ao início
      </Link>
    </main>
  );
}
