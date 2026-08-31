import { AlertTriangle, Lightbulb, ShoppingCart, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { StatCard } from "@/components/shared/stat-card";
import { formatarMoeda, formatarNumero } from "@/lib/format";
import { can } from "@/lib/auth/permissions";
import { analisarEstoque } from "@/server/services/stock-analysis.service";
import { requireContext } from "@/server/session";

export const metadata: Metadata = { title: "Análise do estoque" };
export const dynamic = "force-dynamic";

/**
 * Diagnostico do estoque (secao 8).
 *
 * Os numeros sao calculados pelo sistema; a IA apenas os interpreta. Sem chave
 * configurada, a pagina continua util: perde a narrativa, mantem os fatos.
 */
export default async function AnalisePage() {
  const ctx = await requireContext();
  if (!can(ctx.role, "ai:use")) redirect("/dashboard");

  const { diagnostico, narrativa, motivoSemNarrativa } = await analisarEstoque();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Análise do estoque
        </h1>
        <p className="text-muted-foreground text-sm">
          Os números vêm de contas sobre o banco. A leitura deles é escrita pela
          IA, que não recalcula nada.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          titulo="Investido em estoque"
          valor={formatarMoeda(diagnostico.valorInvestido)}
          detalhe={`${formatarNumero(diagnostico.totalDeUnidades)} unidades`}
          icone="Package"
        />
        <StatCard
          titulo="Valor estimado"
          valor={formatarMoeda(diagnostico.valorEstimado)}
          detalhe={`margem ${formatarMoeda(diagnostico.valorEstimado - diagnostico.valorInvestido)}`}
          icone="FileBarChart"
          destaque="positivo"
        />
        <StatCard
          titulo="Montagens possíveis"
          valor={String(diagnostico.montagensPossiveis)}
          detalhe="com o que está disponível"
          icone="Cpu"
          href="/montagens"
        />
        <StatCard
          titulo="Parado em defeito"
          valor={formatarMoeda(diagnostico.valorEmDefeito)}
          detalhe={`${diagnostico.itensComDefeito} peças`}
          icone="AlertTriangle"
          destaque={diagnostico.itensComDefeito > 0 ? "atencao" : "neutro"}
        />
      </section>

      {narrativa ? (
        <section className="bg-card rounded-lg border p-4">
          <h2 className="mb-2 text-sm font-medium">Diagnóstico</h2>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {narrativa.resumo}
          </p>
        </section>
      ) : (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {motivoSemNarrativa}
        </p>
      )}

      {narrativa ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Lista
            titulo="Pontos de atenção"
            icone={<AlertTriangle className="size-4 text-amber-600" aria-hidden />}
            itens={narrativa.pontosDeAtencao}
          />
          <Lista
            titulo="Oportunidades"
            icone={<Lightbulb className="size-4 text-sky-600" aria-hidden />}
            itens={narrativa.oportunidades}
          />
          <Lista
            titulo="Vale comprar"
            icone={<ShoppingCart className="size-4 text-emerald-600" aria-hidden />}
            itens={narrativa.recomendacoesDeCompra}
          />
          <Lista
            titulo="Vale vender"
            icone={<TrendingUp className="size-4 text-violet-600" aria-hidden />}
            itens={narrativa.recomendacoesDeVenda}
          />
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="bg-card rounded-lg border">
          <h2 className="border-b px-4 py-3 text-sm font-medium">
            Onde o dinheiro está
          </h2>
          <ul className="divide-y">
            {diagnostico.ondeOdinheiroEsta.map((linha) => (
              <li
                key={linha.categoria}
                className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <span>{linha.categoria}</span>
                <span className="text-right">
                  <span className="tabular-nums">
                    {formatarMoeda(linha.valor)}
                  </span>
                  <span className="text-muted-foreground ml-2 text-xs">
                    {linha.unidades} un.
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-card rounded-lg border">
          <h2 className="border-b px-4 py-3 text-sm font-medium">
            Parado há mais tempo
          </h2>
          <ul className="divide-y">
            {diagnostico.paradasHaMuitoTempo.map((peca) => (
              <li key={peca.codigo} className="px-4 py-2.5 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate">{peca.nome}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {peca.diasParada} dias
                  </span>
                </div>
                <span className="text-muted-foreground font-mono text-xs">
                  {peca.codigo}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {diagnostico.desequilibrios.length > 0 ? (
        <section className="bg-card rounded-lg border p-4">
          <h2 className="mb-2 text-sm font-medium">Desequilíbrios</h2>
          <ul className="text-muted-foreground space-y-1 text-sm">
            {diagnostico.desequilibrios.map((item) => (
              <li key={item.descricao}>{item.descricao}</li>
            ))}
          </ul>
          <Link
            href="/montagens"
            className="mt-2 inline-block text-sm underline"
          >
            Ver o efeito nas montagens
          </Link>
        </section>
      ) : null}
    </div>
  );
}

function Lista({
  titulo,
  icone,
  itens,
}: {
  titulo: string;
  icone: React.ReactNode;
  itens: string[];
}) {
  if (itens.length === 0) return null;

  return (
    <section className="bg-card rounded-lg border p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
        {icone}
        {titulo}
      </h2>
      <ul className="space-y-2 text-sm">
        {itens.map((item) => (
          <li key={item} className="text-muted-foreground">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
