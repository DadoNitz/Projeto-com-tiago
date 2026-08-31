import { Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { StatCard } from "@/components/shared/stat-card";
import { formatarMoeda, formatarNumero } from "@/lib/format";
import { extratoDosSocios } from "@/server/services/partner.service";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Sócios" };
export const dynamic = "force-dynamic";

/**
 * Extrato por sócio.
 *
 * Responde diretamente "quanto cada um gastou e quanto voltou". Os números
 * vêm do histórico de movimentação, não de campos de saldo — por isso batem
 * mesmo depois de correções e cancelamentos.
 */
export default async function SociosPage() {
  const socios = await extratoDosSocios();

  const totalInvestido = socios.reduce((soma, s) => soma + s.investido, 0);
  const totalRetornado = socios.reduce((soma, s) => soma + s.retornado, 0);
  const totalParado = socios.reduce((soma, s) => soma + s.valorParado, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Sócios
        </h1>
        <p className="text-muted-foreground text-sm">
          Quanto cada pessoa colocou na operação e quanto já voltou.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          titulo="Total investido"
          valor={formatarMoeda(totalInvestido)}
          detalhe="soma das compras registradas"
          icone="Users"
        />
        <StatCard
          titulo="Já retornado"
          valor={formatarMoeda(totalRetornado)}
          detalhe="soma das vendas registradas"
          icone="FileBarChart"
          destaque={totalRetornado > 0 ? "positivo" : "neutro"}
        />
        <StatCard
          titulo="Parado em estoque"
          valor={formatarMoeda(totalParado)}
          detalhe="valor estimado do que ainda não vendeu"
          icone="Package"
          destaque="atencao"
        />
      </section>

      <section className="bg-card overflow-hidden rounded-lg border">
        <h2 className="border-b px-4 py-3 text-sm font-medium">
          Extrato individual
        </h2>

        {socios.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <Users className="text-muted-foreground size-8" aria-hidden />
            <p className="text-sm">Nenhum sócio cadastrado ainda.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {socios.map((socio) => {
              const saldo = socio.retornado - socio.investido;

              return (
                <li key={socio.id} id={socio.id} className="p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-medium">
                      {socio.name}
                      {!socio.active ? (
                        <span className="text-muted-foreground ml-2 text-xs">
                          inativo
                        </span>
                      ) : null}
                    </h3>
                    <Link
                      href={`/estoque/itens?ordenacao=recentes`}
                      className="text-muted-foreground hover:text-foreground text-xs"
                    >
                      {formatarNumero(socio.pecasEmEstoque)} peças em estoque
                    </Link>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Valor rotulo="Investido" valor={formatarMoeda(socio.investido)} />
                    <Valor rotulo="Retornado" valor={formatarMoeda(socio.retornado)} />
                    <Valor
                      rotulo="Parado em estoque"
                      valor={formatarMoeda(socio.valorParado)}
                    />
                    <Valor
                      rotulo="Saldo realizado"
                      valor={formatarMoeda(saldo)}
                      className={
                        saldo > 0
                          ? "text-emerald-600"
                          : saldo < 0
                            ? "text-amber-600"
                            : undefined
                      }
                    />
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-muted-foreground text-xs leading-relaxed">
        &quot;Saldo realizado&quot; considera apenas vendas já registradas. Enquanto as
        peças não forem vendidas, o valor aparece em &quot;parado em estoque&quot; — que é
        uma estimativa, não dinheiro em caixa.
      </p>
    </div>
  );
}

function Valor({
  rotulo,
  valor,
  className,
}: {
  rotulo: string;
  valor: string;
  className?: string;
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className={cn("text-sm font-medium tabular-nums", className)}>
        {valor}
      </dd>
    </div>
  );
}
