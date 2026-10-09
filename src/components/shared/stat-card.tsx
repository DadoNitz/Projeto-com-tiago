import Link from "next/link";

import { Icone } from "@/components/layout/icon";
import { CountUp } from "@/components/motion/count-up";
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
  numero,
  formato,
  detalhe,
  icone,
  href,
  destaque,
}: {
  titulo: string;
  valor: string;
  /** Quando informado, o número conta até o valor ao abrir a tela. */
  numero?: number;
  formato?: "numero" | "moeda";
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
            "size-9 shrink-0 rounded-xl p-2",
            destaque === "atencao"
              ? "bg-st-hold-soft text-st-hold"
              : destaque === "positivo"
                ? "bg-st-ok-soft text-st-ok"
                : "bg-muted text-muted-foreground",
          )}
        />
      </div>
      <p className="mt-2 font-mono text-xl font-semibold tracking-tight tabular-nums break-words sm:text-2xl">
        {numero !== undefined ? (
          <CountUp valor={numero} formato={formato} />
        ) : (
          valor
        )}
      </p>
      {detalhe ? (
        <p className="text-muted-foreground mt-1 text-xs">{detalhe}</p>
      ) : null}
    </>
  );

  const classe = cn(
    "bg-card min-w-0 h-full rounded-3xl border p-4",
    href &&
      "hover:border-foreground/25 transition-all duration-200 active:scale-[0.98]",
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
