"use client";

import { RotateCw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { buttonVariants } from "@/components/ui/button";

/**
 * Fronteira de erro da área autenticada.
 *
 * Sem ela, uma consulta que falha derruba a árvore inteira e o Next mostra a
 * tela crua dele — em produção, só "Application error", fora do layout e em
 * inglês. Aqui o menu continua de pé e sobra caminho para sair.
 *
 * O `digest` é o identificador que o Next grava junto do erro no servidor.
 * Aparece na tela de propósito: é por ele que se acha a linha certa no log,
 * já que a mensagem real nunca chega ao navegador em produção.
 */
export default function ErroDaArea({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <div className="bg-destructive/10 text-destructive flex size-12 items-center justify-center rounded-xl">
        <TriangleAlert className="size-6" aria-hidden />
      </div>

      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Esta tela não carregou</h1>
        <p className="text-muted-foreground text-sm">
          A consulta ao banco falhou no meio do caminho. Tentar de novo resolve
          quando foi queda momentânea de conexão.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className={buttonVariants({ className: "h-11" })}
        >
          <RotateCw className="size-4" aria-hidden />
          Tentar de novo
        </button>
        <Link
          href="/dashboard"
          className={buttonVariants({ variant: "outline", className: "h-11" })}
        >
          Ir para o dashboard
        </Link>
      </div>

      {error.digest ? (
        <p className="text-muted-foreground text-xs">
          Código do erro: <span className="font-mono">{error.digest}</span>
        </p>
      ) : null}
    </div>
  );
}
