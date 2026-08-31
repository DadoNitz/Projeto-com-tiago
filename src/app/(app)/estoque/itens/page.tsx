import { PackageSearch } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Icone } from "@/components/layout/icon";
import { ConditionBadge, StatusBadge } from "@/components/shared/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { formatarData, formatarMoeda, formatarNumero } from "@/lib/format";
import { filtroEstoqueSchema } from "@/lib/validation/inventory";
import {
  listarMarcas,
  listarCategorias,
  listarLocais,
} from "@/server/services/catalog.service";
import { listarUnidades } from "@/server/services/inventory.service";

import { Filtros } from "./filtros";

export const metadata: Metadata = { title: "Estoque" };
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Normaliza os parâmetros da URL para o formato do filtro.
 *
 * A URL sempre entrega texto e pode entregar valores repetidos. Passar isso
 * pelo mesmo schema Zod da action garante que a listagem e a API filtrem
 * exatamente igual.
 */
function lerFiltro(searchParams: SearchParams) {
  const bruto = {
    ...searchParams,
    status: searchParams.status
      ? [searchParams.status].flat()
      : undefined,
    condition: searchParams.condition
      ? [searchParams.condition].flat()
      : undefined,
  };

  const resultado = filtroEstoqueSchema.safeParse(bruto);
  // Filtro inválido na URL (link antigo, digitação) não pode quebrar a
  // página: cai no filtro padrão.
  return resultado.success ? resultado.data : filtroEstoqueSchema.parse({});
}

export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filtro = lerFiltro(params);

  const [pagina, categorias, marcas, locais] = await Promise.all([
    listarUnidades(filtro),
    listarCategorias(),
    listarMarcas(),
    listarLocais(),
  ]);

  const filtrosAtivos = [
    filtro.categoryId,
    filtro.brandId,
    filtro.locationId,
    filtro.precoMin,
    filtro.precoMax,
    ...(filtro.status ?? []),
    ...(filtro.condition ?? []),
  ].filter(Boolean).length;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Estoque
          </h1>
          <p className="text-muted-foreground text-sm">
            {formatarNumero(pagina.total)}{" "}
            {pagina.total === 1 ? "unidade encontrada" : "unidades encontradas"}
            {filtro.q ? ` para "${filtro.q}"` : ""}
          </p>
        </div>

        <div className="lg:hidden">
          <Filtros
            variante="mobile"
            categorias={categorias.map((c) => ({ id: c.id, name: c.name }))}
            marcas={marcas}
            locais={locais}
            totalAtivos={filtrosAtivos}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="hidden lg:block">
          <Filtros
            variante="desktop"
            categorias={categorias.map((c) => ({ id: c.id, name: c.name }))}
            marcas={marcas}
            locais={locais}
            totalAtivos={filtrosAtivos}
          />
        </div>

        <div className="min-w-0">
          {pagina.itens.length === 0 ? (
            <div className="bg-card flex flex-col items-center gap-3 rounded-lg border px-6 py-16 text-center">
              <PackageSearch
                className="text-muted-foreground size-10"
                aria-hidden
              />
              <p className="font-medium">Nenhuma peça encontrada</p>
              <p className="text-muted-foreground max-w-sm text-sm">
                Ajuste os filtros ou tente outro termo de busca. A busca cobre
                nome, modelo, part number, número de série e código interno.
              </p>
            </div>
          ) : (
            <>
              {/* Celular: cards. Tabela larga é inutilizável em tela estreita. */}
              <ul className="space-y-2 lg:hidden">
                {pagina.itens.map((unidade) => (
                  <li key={unidade.id}>
                    <Link
                      href={`/estoque/itens/${unidade.id}`}
                      className="bg-card hover:border-primary/40 flex gap-3 rounded-lg border p-3 transition-colors"
                    >
                      <div className="bg-muted flex size-11 shrink-0 items-center justify-center rounded-md">
                        <Icone
                          nome={unidade.product.category.icon}
                          className="text-muted-foreground size-5"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {unidade.product.name}
                        </p>
                        <p className="text-muted-foreground truncate text-xs">
                          {unidade.product.brand?.name ?? "Sem marca"} ·{" "}
                          {unidade.internalCode}
                          {unidade.serialLast ? ` · ••${unidade.serialLast}` : ""}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={unidade.status} />
                          <ConditionBadge condition={unidade.condition} />
                          {unidade.location ? (
                            <span className="text-muted-foreground text-xs">
                              {unidade.location.name}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-medium tabular-nums">
                          {formatarMoeda(unidade.estimatedSalePrice)}
                        </p>
                        {unidade.quantity > 1 ? (
                          <p className="text-muted-foreground text-xs">
                            {unidade.quantity} un.
                          </p>
                        ) : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>

              {/* Desktop: tabela completa */}
              <div className="bg-card hidden overflow-x-auto rounded-lg border lg:block">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr className="text-left">
                      <th className="px-4 py-2.5 font-medium">Peça</th>
                      <th className="px-4 py-2.5 font-medium">Código</th>
                      <th className="px-4 py-2.5 font-medium">Situação</th>
                      <th className="px-4 py-2.5 font-medium">Local</th>
                      <th className="px-4 py-2.5 font-medium">Entrada</th>
                      <th className="px-4 py-2.5 text-right font-medium">
                        Valor
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pagina.itens.map((unidade) => (
                      <tr key={unidade.id} className="hover:bg-muted/40">
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/estoque/itens/${unidade.id}`}
                            className="flex items-center gap-2.5"
                          >
                            <Icone
                              nome={unidade.product.category.icon}
                              className="text-muted-foreground size-4 shrink-0"
                            />
                            <span className="min-w-0">
                              <span className="block truncate font-medium">
                                {unidade.product.name}
                              </span>
                              <span className="text-muted-foreground block truncate text-xs">
                                {unidade.product.brand?.name ?? "Sem marca"}
                                {unidade.product.model
                                  ? ` · ${unidade.product.model}`
                                  : ""}
                              </span>
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="font-mono text-xs">
                            {unidade.internalCode}
                          </span>
                          {unidade.serialLast ? (
                            <span className="text-muted-foreground block font-mono text-xs">
                              ••••{unidade.serialLast}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-col items-start gap-1">
                            <StatusBadge status={unidade.status} />
                            <ConditionBadge condition={unidade.condition} />
                          </div>
                        </td>
                        <td className="text-muted-foreground px-4 py-2.5">
                          {unidade.location?.name ?? "—"}
                        </td>
                        <td className="text-muted-foreground px-4 py-2.5 whitespace-nowrap">
                          {formatarData(unidade.entryDate)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {formatarMoeda(unidade.estimatedSalePrice)}
                          {unidade.quantity > 1 ? (
                            <span className="text-muted-foreground block text-xs">
                              {unidade.quantity} un.
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {pagina.proximoCursor ? (
                <div className="mt-4 flex justify-center">
                  <Link
                    className={buttonVariants({
                      variant: "outline",
                      className: "h-11",
                    })}
                    href={`/estoque/itens?${new URLSearchParams({
                        ...Object.fromEntries(
                          Object.entries(params).filter(
                            ([chave, valor]) =>
                              chave !== "cursor" && typeof valor === "string",
                          ) as [string, string][],
                        ),
                      cursor: pagina.proximoCursor,
                    }).toString()}`}
                  >
                    Carregar mais
                  </Link>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
