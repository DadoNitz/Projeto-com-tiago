import { ArrowLeftRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import type { MovementType } from "@/generated/prisma/enums";
import { formatarDataHora, formatarMoeda } from "@/lib/format";
import { MOVIMENTO_DE_SAIDA, ROTULO_MOVIMENTO } from "@/lib/inventory-labels";
import { listarMovimentacoes } from "@/server/services/movement-history.service";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Movimentações" };
export const dynamic = "force-dynamic";

const TIPOS = Object.keys(ROTULO_MOVIMENTO) as MovementType[];

/**
 * Histórico de movimentação do estoque inteiro.
 *
 * É a trilha que permite responder "o que aconteceu com o estoque". Como o
 * histórico é append-only, esta tela nunca oferece edição nem exclusão: uma
 * movimentação registrada é um fato passado.
 */
export default async function MovimentacoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tipoFiltro = typeof params.type === "string" ? params.type : undefined;
  const cursor = typeof params.cursor === "string" ? params.cursor : undefined;

  const pagina = await listarMovimentacoes({
    tipo: TIPOS.includes(tipoFiltro as MovementType)
      ? (tipoFiltro as MovementType)
      : undefined,
    cursor,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Movimentações
        </h1>
        <p className="text-muted-foreground text-sm">
          Tudo o que entrou, saiu e mudou de lugar. O histórico não é editável.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <FiltroTipo ativo={!tipoFiltro} href="/estoque/movimentacoes">
          Todos
        </FiltroTipo>
        {TIPOS.map((tipo) => (
          <FiltroTipo
            key={tipo}
            ativo={tipoFiltro === tipo}
            href={`/estoque/movimentacoes?type=${tipo}`}
          >
            {ROTULO_MOVIMENTO[tipo]}
          </FiltroTipo>
        ))}
      </div>

      {pagina.itens.length === 0 ? (
        <div className="bg-card flex flex-col items-center gap-2 rounded-lg border px-6 py-16 text-center">
          <ArrowLeftRight className="text-muted-foreground size-8" aria-hidden />
          <p className="text-sm">Nenhuma movimentação com este filtro.</p>
        </div>
      ) : (
        <ol className="bg-card divide-y overflow-hidden rounded-lg border">
          {pagina.itens.map((movimento) => (
            <li key={movimento.id} className="flex gap-3 p-3">
              <span
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  MOVIMENTO_DE_SAIDA.has(movimento.type)
                    ? "bg-amber-500"
                    : "bg-emerald-500",
                )}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-medium">
                    {ROTULO_MOVIMENTO[movimento.type]}
                  </span>
                  {" · "}
                  <Link
                    href={`/estoque/itens/${movimento.unitId}`}
                    className="hover:underline"
                  >
                    {movimento.product.name}
                  </Link>
                  {movimento.quantity > 1 ? ` (${movimento.quantity} un.)` : ""}
                </p>
                {movimento.reason ? (
                  <p className="text-muted-foreground text-sm">
                    {movimento.reason}
                  </p>
                ) : null}
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {formatarDataHora(movimento.createdAt)}
                  {movimento.user ? ` · ${movimento.user.name}` : ""}
                  {movimento.partner ? ` · ${movimento.partner.name}` : ""}
                  {movimento.toLocation
                    ? ` · para ${movimento.toLocation.name}`
                    : ""}
                </p>
              </div>
              {movimento.amount ? (
                <p className="shrink-0 text-sm tabular-nums">
                  {formatarMoeda(movimento.amount)}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      {pagina.proximoCursor ? (
        <div className="flex justify-center">
          <Link
            href={`/estoque/movimentacoes?${new URLSearchParams({
              ...(tipoFiltro ? { type: tipoFiltro } : {}),
              cursor: pagina.proximoCursor,
            }).toString()}`}
            className="text-sm underline"
          >
            Carregar mais
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function FiltroTipo({
  ativo,
  href,
  children,
}: {
  ativo: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs transition-colors",
        ativo ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted",
      )}
    >
      {children}
    </Link>
  );
}
