import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { StatCard } from "@/components/shared/stat-card";
import type { UnitStatus } from "@/generated/prisma/enums";
import { can } from "@/lib/auth/permissions";
import { formatarMoeda, formatarNumero } from "@/lib/format";
import { ROTULO_STATUS } from "@/lib/inventory-labels";
import {
  gerarRelatorio,
  ROTULO_PERIODO,
  type Periodo,
} from "@/server/services/report.service";
import { requireContext } from "@/server/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Relatórios" };
export const dynamic = "force-dynamic";

const PERIODOS: Periodo[] = ["hoje", "7dias", "30dias", "mes", "ano", "tudo"];

/**
 * Relatórios do estoque (seção 9).
 *
 * O período filtra a **movimentação**; a posição de estoque é sempre a atual.
 * Misturar as duas coisas produziria um número sem sentido: "quanto eu tinha
 * em estoque nos últimos 7 dias" não é uma pergunta respondível sem escolher
 * um instante.
 */
export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireContext();
  if (!can(ctx.role, "report:read")) redirect("/dashboard");

  const params = await searchParams;
  const periodo = PERIODOS.includes(params.periodo as Periodo)
    ? (params.periodo as Periodo)
    : "30dias";

  const relatorio = await gerarRelatorio(periodo);
  const margem = relatorio.totalGeral.estimado - relatorio.totalGeral.investido;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Relatórios
          </h1>
          <p className="text-muted-foreground text-sm">
            O período filtra a movimentação. A posição de estoque é sempre a
            atual.
          </p>
        </div>

        <Link
          href="/api/exportar"
          className="hover:bg-muted inline-flex h-11 items-center gap-2 rounded-lg border px-4 text-sm"
          download
        >
          <Download className="size-4" aria-hidden />
          Exportar CSV
        </Link>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PERIODOS.map((opcao) => (
          <Link
            key={opcao}
            href={`/relatorios?periodo=${opcao}`}
            className={cn(
              "inline-flex min-h-11 items-center rounded-xl border px-3 py-2 text-sm transition-colors",
              periodo === opcao
                ? "bg-primary text-primary-foreground border-primary"
                : "hover:bg-muted",
            )}
          >
            {ROTULO_PERIODO[opcao]}
          </Link>
        ))}
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          titulo="Unidades em estoque"
          valor={formatarNumero(relatorio.totalGeral.unidades)}
          icone="Package"
        />
        <StatCard
          titulo="Investido"
          valor={formatarMoeda(relatorio.totalGeral.investido)}
          icone="ShoppingCart"
        />
        <StatCard
          titulo="Valor estimado"
          valor={formatarMoeda(relatorio.totalGeral.estimado)}
          detalhe={`margem ${formatarMoeda(margem)}`}
          icone="FileBarChart"
          destaque="positivo"
        />
        <StatCard
          titulo={`Vendas · ${ROTULO_PERIODO[periodo]}`}
          valor={formatarMoeda(relatorio.vendas.valor)}
          detalhe={`${relatorio.vendas.quantidade} peças`}
          icone="Tag"
        />
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Tabela titulo="Por categoria" linhas={relatorio.porCategoria} />
        <Tabela titulo="Por marca" linhas={relatorio.porMarca.slice(0, 12)} />

        <section className="bg-card rounded-lg border">
          <h2 className="border-b px-4 py-3 text-sm font-medium">
            Por situação
          </h2>
          <ul className="divide-y">
            {relatorio.porSituacao.map((linha) => (
              <li
                key={linha.rotulo}
                className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <span>
                  {ROTULO_STATUS[linha.rotulo as UnitStatus] ?? linha.rotulo}
                </span>
                <span className="tabular-nums">
                  {formatarNumero(linha.quantidade)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-card rounded-lg border">
          <h2 className="border-b px-4 py-3 text-sm font-medium">
            Movimentação · {ROTULO_PERIODO[periodo]}
          </h2>
          <ul className="divide-y text-sm">
            <li className="flex justify-between px-4 py-2.5">
              <span>Entradas</span>
              <span className="tabular-nums">
                {relatorio.entradas.quantidade} peças ·{" "}
                {formatarMoeda(relatorio.entradas.valor)}
              </span>
            </li>
            <li className="flex justify-between px-4 py-2.5">
              <span>Saídas</span>
              <span className="tabular-nums">
                {relatorio.saidas.quantidade} peças ·{" "}
                {formatarMoeda(relatorio.saidas.valor)}
              </span>
            </li>
          </ul>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="bg-card rounded-lg border">
          <h2 className="border-b px-4 py-3 text-sm font-medium">
            Peças mais antigas no estoque
          </h2>
          <ul className="divide-y">
            {relatorio.maisAntigas.map((peca) => (
              <li key={peca.codigo} className="px-4 py-2.5 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate">{peca.nome}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {peca.diasParada} dias
                  </span>
                </div>
                <span className="text-muted-foreground font-mono text-xs">
                  {peca.codigo} · {formatarMoeda(peca.valor)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-card rounded-lg border">
          <h2 className="border-b px-4 py-3 text-sm font-medium">
            Maior giro · {ROTULO_PERIODO[periodo]}
          </h2>
          {relatorio.maiorGiro.length === 0 ? (
            <p className="text-muted-foreground px-4 py-6 text-center text-sm">
              Sem movimentação no período.
            </p>
          ) : (
            <ul className="divide-y">
              {relatorio.maiorGiro.map((linha) => (
                <li
                  key={linha.nome}
                  className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <span className="truncate">{linha.nome}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {linha.movimentacoes} mov.
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Tabela({
  titulo,
  linhas,
}: {
  titulo: string;
  linhas: { rotulo: string; quantidade: number; valor: number }[];
}) {
  return (
    <section className="bg-card rounded-lg border">
      <h2 className="border-b px-4 py-3 text-sm font-medium">{titulo}</h2>
      {linhas.length === 0 ? (
        <p className="text-muted-foreground px-4 py-6 text-center text-sm">
          Nada disponível.
        </p>
      ) : (
        <ul className="divide-y">
          {linhas.map((linha) => (
            <li
              key={linha.rotulo}
              className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm"
            >
              <span className="truncate">{linha.rotulo}</span>
              <span className="text-right">
                <span className="tabular-nums">
                  {formatarMoeda(linha.valor)}
                </span>
                <span className="text-muted-foreground ml-2 text-xs">
                  {linha.quantidade} un.
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
