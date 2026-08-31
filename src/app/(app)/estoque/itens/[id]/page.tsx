import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Icone } from "@/components/layout/icon";
import { ConditionBadge, StatusBadge } from "@/components/shared/status-badge";
import { conteudoQrCode } from "@/domain/inventory/serial";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/format";
import {
  MOVIMENTO_DE_SAIDA,
  ROTULO_MOVIMENTO,
} from "@/lib/inventory-labels";
import { caminhoDoLocal, listarLocais } from "@/server/services/catalog.service";
import { NaoEncontradoError } from "@/server/services/errors";
import { buscarUnidade } from "@/server/services/inventory.service";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const unidade = await buscarUnidade(id);
    return { title: `${unidade.product.name} · ${unidade.internalCode}` };
  } catch {
    return { title: "Unidade não encontrada" };
  }
}

/**
 * Detalhe da unidade física.
 *
 * É o destino do QR Code da etiqueta: apontar a câmera para a peça leva
 * exatamente aqui. Por isso a página abre com o que se precisa saber em pé na
 * frente da prateleira — o que é, onde está, em que situação — e só depois
 * mostra valores e histórico.
 */
export default async function UnidadePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let unidade;
  try {
    unidade = await buscarUnidade(id);
  } catch (erro) {
    if (erro instanceof NaoEncontradoError) notFound();
    throw erro;
  }

  const locais = await listarLocais();
  const caminho = caminhoDoLocal(locais, unidade.locationId);

  const specs = Object.entries(
    (unidade.product.specs ?? {}) as Record<string, unknown>,
  );
  const margem =
    unidade.estimatedSalePrice && unidade.purchaseCost
      ? Number(unidade.estimatedSalePrice) - Number(unidade.purchaseCost)
      : null;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link
        href="/estoque/itens"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Voltar ao estoque
      </Link>

      <header className="bg-card rounded-lg border p-4">
        <div className="flex items-start gap-3">
          <div className="bg-muted flex size-12 shrink-0 items-center justify-center rounded-lg">
            <Icone
              nome={unidade.product.category.icon}
              className="text-muted-foreground size-6"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
              {unidade.product.name}
            </h1>
            <p className="text-muted-foreground text-sm">
              {unidade.product.brand?.name ?? "Sem marca"} ·{" "}
              {unidade.product.category.name}
              {unidade.product.model ? ` · ${unidade.product.model}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={unidade.status} />
              <ConditionBadge condition={unidade.condition} />
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="bg-card rounded-lg border">
          <h2 className="border-b px-4 py-3 text-sm font-medium">
            Identificação e local
          </h2>
          <dl className="divide-y">
            <Linha rotulo="Código interno">
              <span className="font-mono">{unidade.internalCode}</span>
            </Linha>
            <Linha rotulo="Conteúdo do QR Code">
              <span className="font-mono text-xs">
                {conteudoQrCode(unidade.internalCode)}
              </span>
            </Linha>
            <Linha rotulo="Número de série">
              {unidade.serialNumber ? (
                <span className="font-mono">{unidade.serialNumber}</span>
              ) : (
                <span className="text-muted-foreground">Não informado</span>
              )}
            </Linha>
            <Linha rotulo="Final do serial">
              {unidade.serialLast ? (
                <span className="font-mono">••••{unidade.serialLast}</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Linha>
            <Linha rotulo="Localização">
              {caminho || (
                <span className="text-muted-foreground">Sem local definido</span>
              )}
            </Linha>
            <Linha rotulo="Quantidade">
              {unidade.quantity}
              {unidade.product.trackingMode === "QUANTITY" ? (
                <span className="text-muted-foreground ml-1 text-xs">
                  (controlado por saldo)
                </span>
              ) : null}
            </Linha>
          </dl>
        </section>

        <section className="bg-card rounded-lg border">
          <h2 className="border-b px-4 py-3 text-sm font-medium">
            Valores e origem
          </h2>
          <dl className="divide-y">
            <Linha rotulo="Comprado por">
              {unidade.purchasedBy ? (
                <Link
                  href={`/socios#${unidade.purchasedBy.id}`}
                  className="font-medium hover:underline"
                >
                  {unidade.purchasedBy.name}
                </Link>
              ) : (
                <span className="text-muted-foreground">Não informado</span>
              )}
            </Linha>
            <Linha rotulo="Valor de compra">
              {formatarMoeda(unidade.purchaseCost)}
            </Linha>
            <Linha rotulo="Valor estimado de venda">
              {formatarMoeda(unidade.estimatedSalePrice)}
            </Linha>
            {margem !== null ? (
              <Linha rotulo="Margem estimada">
                <span
                  className={cn(
                    "tabular-nums",
                    margem >= 0 ? "text-emerald-600" : "text-red-600",
                  )}
                >
                  {formatarMoeda(margem)}
                </span>
              </Linha>
            ) : null}
            {unidade.soldPrice ? (
              <Linha rotulo="Vendido por">
                {formatarMoeda(unidade.soldPrice)}
                {unidade.soldAt ? ` em ${formatarData(unidade.soldAt)}` : ""}
              </Linha>
            ) : null}
            <Linha rotulo="Data de entrada">
              {formatarData(unidade.entryDate)}
            </Linha>
            <Linha rotulo="Origem">
              {unidade.origin ?? (
                <span className="text-muted-foreground">Não informada</span>
              )}
            </Linha>
          </dl>
        </section>
      </div>

      {specs.length > 0 ? (
        <section className="bg-card rounded-lg border">
          <h2 className="border-b px-4 py-3 text-sm font-medium">
            Especificações técnicas
            <span className="text-muted-foreground ml-2 text-xs font-normal">
              do modelo, compartilhadas por todas as unidades
            </span>
          </h2>
          <dl className="grid gap-x-6 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {specs.map(([chave, valor]) => (
              <div key={chave} className="flex justify-between gap-2 py-1.5 text-sm">
                <dt className="text-muted-foreground">{chave}</dt>
                <dd className="text-right font-medium">
                  {Array.isArray(valor)
                    ? valor.join(", ")
                    : typeof valor === "boolean"
                      ? valor
                        ? "Sim"
                        : "Não"
                      : String(valor)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {unidade.notes ? (
        <section className="bg-card rounded-lg border p-4">
          <h2 className="mb-2 text-sm font-medium">Observações</h2>
          <p className="text-muted-foreground text-sm whitespace-pre-wrap">
            {unidade.notes}
          </p>
        </section>
      ) : null}

      <section className="bg-card rounded-lg border">
        <h2 className="border-b px-4 py-3 text-sm font-medium">
          Histórico de movimentação
        </h2>
        <ol className="divide-y">
          {unidade.movements.map((movimento) => (
            <li key={movimento.id} className="flex gap-3 px-4 py-3">
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
                <p className="text-sm font-medium">
                  {ROTULO_MOVIMENTO[movimento.type]}
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
                  {movimento.amount
                    ? ` · ${formatarMoeda(movimento.amount)}`
                    : ""}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Linha({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm">
      <dt className="text-muted-foreground shrink-0">{rotulo}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}
