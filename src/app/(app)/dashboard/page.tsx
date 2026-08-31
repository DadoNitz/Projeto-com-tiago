import { AlertTriangle, ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Icone } from "@/components/layout/icon";
import { StatCard } from "@/components/shared/stat-card";
import { ConditionBadge, StatusBadge } from "@/components/shared/status-badge";
import {
  formatarData,
  formatarMoeda,
  formatarNumero,
} from "@/lib/format";
import {
  alertasDeEstoqueBaixo,
  itensQuePrecisamDeAtencao,
  resumoDoEstoque,
  totaisPorCategoria,
  ultimasEntradas,
} from "@/server/services/dashboard.service";

export const metadata: Metadata = { title: "Dashboard" };

// Números de estoque mudam a cada movimentação; cache aqui mostraria um
// inventário que já não existe.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [resumo, categorias, entradas, estoqueBaixo, atencao] =
    await Promise.all([
      resumoDoEstoque(),
      totaisPorCategoria(),
      ultimasEntradas(6),
      alertasDeEstoqueBaixo(5),
      itensQuePrecisamDeAtencao(5),
    ]);

  const margem = resumo.valorEstimado - resumo.custoTotal;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Dashboard
        </h1>
        <p className="text-muted-foreground text-sm">
          Visão geral do estoque em tempo real.
        </p>
      </div>

      <section
        aria-label="Indicadores"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <StatCard
          titulo="Itens disponíveis"
          valor={formatarNumero(resumo.disponiveis)}
          detalhe={`${formatarNumero(resumo.unidades)} unidades no total`}
          icone="Package"
          href="/estoque/itens?status=AVAILABLE"
          destaque="positivo"
        />
        <StatCard
          titulo="Reservados"
          valor={formatarNumero(resumo.reservados)}
          detalhe="aguardando retirada ou montagem"
          icone="Tag"
          href="/estoque/itens?status=RESERVED"
        />
        <StatCard
          titulo="Com defeito"
          valor={formatarNumero(resumo.comDefeito)}
          detalhe="precisam de teste ou descarte"
          icone="AlertTriangle"
          href="/estoque/itens?status=DEFECTIVE"
          destaque={resumo.comDefeito > 0 ? "atencao" : "neutro"}
        />
        <StatCard
          titulo="Valor do estoque"
          valor={formatarMoeda(resumo.valorEstimado)}
          detalhe={`custo ${formatarMoeda(resumo.custoTotal)} · margem ${formatarMoeda(margem)}`}
          icone="FileBarChart"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <section
          aria-label="Estoque por categoria"
          className="bg-card rounded-lg border lg:col-span-2"
        >
          <header className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-medium">Estoque por categoria</h2>
            <Link
              href="/estoque/itens"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
            >
              Ver tudo <ArrowRight className="size-3" aria-hidden />
            </Link>
          </header>

          <ul className="divide-y">
            {categorias.map((categoria) => {
              // Barra proporcional à maior categoria: dá a leitura relativa
              // sem precisar de biblioteca de gráfico nesta tela.
              const maior = categorias[0]?.unidades ?? 1;
              const proporcao = Math.max(
                4,
                Math.round((categoria.unidades / maior) * 100),
              );

              return (
                <li key={categoria.id}>
                  <Link
                    href={`/estoque/itens?categoryId=${categoria.id}`}
                    className="hover:bg-muted/50 flex items-center gap-3 px-4 py-3 transition-colors"
                  >
                    <Icone
                      nome={categoria.icon}
                      className="text-muted-foreground size-4 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm">{categoria.name}</span>
                        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                          {formatarNumero(categoria.disponiveis)} disp. ·{" "}
                          {formatarMoeda(categoria.valor)}
                        </span>
                      </div>
                      <div className="bg-muted mt-1.5 h-1.5 overflow-hidden rounded-full">
                        <div
                          className="bg-primary h-full rounded-full"
                          style={{ width: `${proporcao}%` }}
                        />
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="space-y-4">
          <section aria-label="Alertas" className="bg-card rounded-lg border">
            <header className="border-b px-4 py-3">
              <h2 className="text-sm font-medium">Alertas</h2>
            </header>

            {estoqueBaixo.length === 0 && atencao.length === 0 ? (
              <p className="text-muted-foreground px-4 py-6 text-center text-sm">
                Nada exigindo atenção agora.
              </p>
            ) : (
              <ul className="divide-y">
                {estoqueBaixo.map((alerta) => (
                  <li key={alerta.productId} className="flex gap-3 px-4 py-3">
                    <AlertTriangle
                      className="mt-0.5 size-4 shrink-0 text-amber-600"
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm">{alerta.nome}</p>
                      <p className="text-muted-foreground text-xs">
                        {alerta.disponiveis} em estoque · mínimo {alerta.minimo}
                      </p>
                    </div>
                  </li>
                ))}

                {atencao.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/estoque/itens/${item.id}`}
                      className="hover:bg-muted/50 flex gap-3 px-4 py-3 transition-colors"
                    >
                      <AlertTriangle
                        className="mt-0.5 size-4 shrink-0 text-red-600"
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm">{item.product.name}</p>
                        <p className="text-muted-foreground truncate text-xs">
                          {item.internalCode}
                          {item.location ? ` · ${item.location.name}` : ""}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            aria-label="Últimas peças adicionadas"
            className="bg-card rounded-lg border"
          >
            <header className="border-b px-4 py-3">
              <h2 className="text-sm font-medium">Últimas adicionadas</h2>
            </header>
            <ul className="divide-y">
              {entradas.map((unidade) => (
                <li key={unidade.id}>
                  <Link
                    href={`/estoque/itens/${unidade.id}`}
                    className="hover:bg-muted/50 flex items-center gap-3 px-4 py-3 transition-colors"
                  >
                    <Icone
                      nome={unidade.product.category.icon}
                      className="text-muted-foreground size-4 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{unidade.product.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {formatarData(unidade.entryDate)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge status={unidade.status} />
                      <ConditionBadge condition={unidade.condition} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
