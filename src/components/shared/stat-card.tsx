import Link from "next/link";

import { Icone } from "@/components/layout/icon";
import { cn } from "@/lib/utils";

/**
 * Cartão de indicador do dashboard.
 *
 * Quando recebe `href`, o cartão inteiro vira link — no celular, um alvo de
 * toque grande vale mais que um link de texto pequeno dentro do cartão.
 */
export function StatCard({
  titulo,
  valor,
  detalhe,
  icone,
  href,
  destaque,
}: {
  titulo: string;
  valor: string;
  detalhe?: string;
  icone: string;
  href?: string;
  destaque?: "neutro" | "atencao" | "positivo";
}) {
  const conteudo = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-muted-foreground text-sm">{titulo}</p>
        <Icone
          nome={icone}
          className={cn(
            "size-4 shrink-0",
            destaque === "atencao"
              ? "text-amber-600"
              : destaque === "positivo"
                ? "text-emerald-600"
                : "text-muted-foreground",
          )}
        />
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
        {valor}
      </p>
      {detalhe ? (
        <p className="text-muted-foreground mt-1 text-xs">{detalhe}</p>
      ) : null}
    </>
  );

  const classe = cn(
    "bg-card rounded-lg border p-4",
    href && "hover:border-primary/40 transition-colors",
  );

  if (href) {
    return (
      <Link href={href} className={cn(classe, "block")}>
        {conteudo}
      </Link>
    );
  }

  return <div className={classe}>{conteudo}</div>;
}
