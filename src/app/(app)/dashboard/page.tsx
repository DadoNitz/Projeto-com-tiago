import { AlertTriangle, ArrowRight, ScanLine } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Icone } from "@/components/layout/icon";
import { CountUp } from "@/components/motion/count-up";
import { StatCard } from "@/components/shared/stat-card";
import { buttonVariants } from "@/components/ui/button";
import { ConditionBadge, StatusBadge } from "@/components/shared/status-badge";
import {
  formatarData,
  formatarMoeda,
  formatarMoedaCompacta,
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

  // Sem preço de venda definido não existe margem: mostrar "-R$ 5.108" daria
  // a impressão de prejuízo quando é só falta de preço.
  const temVenda = resumo.valorEstimado > 0;
  const margem = resumo.valorEstimado - resumo.custoTotal;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-muted-foreground mb-1 font-mono text-xs">
            {formatarData(new Date())}
          </p>
          <h1 className="text-3xl sm:text-4xl">Visão geral</h1>
        </div>
        <Link
          href="/estoque/ler"
          className={buttonVariants({ variant: "outline" })}
        >
          <ScanLine className="size-4" />
          Ler QR Code
        </Link>
      </div>

      {/* Cartão principal: o número que importa, invertido no tema escuro. */}
      <section
        aria-label="Resumo do estoque"
        className="bg-hero text-hero-foreground flex flex-col gap-4 rounded-[28px] p-5 sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-hero-muted text-sm font-medium">
            Disponível agora
          </p>
          <p className="text-hero-muted font-mono text-xs">
            {formatarNumero(resumo.unidades)} unidades no total
          </p>
        </div>
        <div className="flex items-baseline gap-3">
          <CountUp
            valor={resumo.disponiveis}
            className="font-heading text-hero-number text-[76px] leading-[0.85] font-extrabold tracking-[-0.05em] sm:text-[96px]"
          />
          <span className="text-lg font-medium">peças</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Link
            href="/estoque/itens?status=RESERVED"
            className="bg-hero-tile rounded-2xl px-3 py-2.5 transition-transform active:scale-[0.97]"
          >
            <span className="block font-mono text-lg font-semibold">
              {formatarNumero(resumo.reservados)}
            </span>
            <span className="text-hero-muted text-xs">reservadas</span>
          </Link>
          <Link
            href="/estoque/itens?status=DEFECTIVE"
            className="bg-hero-tile rounded-2xl px-3 py-2.5 transition-transform active:scale-[0.97]"
          >
            <span className="block font-mono text-lg font-semibold">
              {formatarNumero(resumo.comDefeito)}
            </span>
            <span className="text-hero-muted text-xs">com defeito</span>
          </Link>
          <div className="bg-hero-tile rounded-2xl px-3 py-2.5">
            <span className="block font-mono text-sm leading-7 font-semibold whitespace-nowrap sm:text-lg">
              {temVenda ? formatarMoedaCompacta(margem) : "—"}
            </span>
            <span className="text-hero-muted text-xs">margem est.</span>
          </div>
        </div>
      </section>

      <section
        aria-label="Indicadores"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <StatCard
          titulo="Itens disponíveis"
          valor={formatarNumero(resumo.disponiveis)}
          numero={resumo.disponiveis}
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
          titulo="Custo do estoque"
          valor={formatarMoeda(resumo.custoTotal)}
          numero={resumo.custoTotal}
          formato="moeda"
          detalhe={
            temVenda
              ? `venda est. ${formatarMoeda(resumo.valorEstimado)} · margem ${formatarMoeda(margem)}`
              : "venda: sem preço definido"
          }
          icone="FileBarChart"
        />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section
          aria-label="Estoque por categoria"
          className="bg-card min-w-0 rounded-3xl border lg:col-span-2"
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

          {/*
            Estoque vazio deixava um cartão com título e nada embaixo — a
            leitura de quem abre o sistema pela primeira vez é de tela
            quebrada, não de estoque zerado. O bloco de alertas ao lado já
            resolvia isso; estas duas listas, não.
          */}
          {categorias.length === 0 ? (
            <p className="text-muted-foreground px-4 py-6 text-center text-sm">
              Nenhuma categoria com peça em estoque ainda.{" "}
              <Link href="/estoque/novo" className="underline">
                Adicionar a primeira
              </Link>
              .
            </p>
          ) : (
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
                        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                          <span className="min-w-0 truncate text-sm">
                            {categoria.name}
                          </span>
                          <span className="text-muted-foreground text-xs tabular-nums">
                            {formatarNumero(categoria.disponiveis)} disp. ·{" "}
                            {formatarMoeda(categoria.valor)}
                          </span>
                        </div>
                        <div className="bg-muted mt-1.5 h-1.5 overflow-hidden rounded-full">
                          <div
                            className="bg-foreground h-full rounded-full"
                            style={{ width: `${proporcao}%` }}
                          />
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="min-w-0 space-y-4">
          <section aria-label="Alertas" className="bg-card rounded-3xl border">
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
                      className="mt-0.5 size-4 shrink-0 text-st-hold"
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
                        className="mt-0.5 size-4 shrink-0 text-st-alert"
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
            className="bg-card rounded-3xl border"
          >
            <header className="border-b px-4 py-3">
              <h2 className="text-sm font-medium">Últimas adicionadas</h2>
            </header>
            {entradas.length === 0 ? (
              <p className="text-muted-foreground px-4 py-6 text-center text-sm">
                Nenhuma peça cadastrada até agora.
              </p>
            ) : (
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
                        <p className="truncate text-sm">
                          {unidade.product.name}
                        </p>
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
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
