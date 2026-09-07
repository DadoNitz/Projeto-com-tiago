import { AlertTriangle, Cpu, TriangleAlert, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { SalvarMontagem } from "@/components/inventory/salvar-montagem";
import { VerificarCheck } from "@/components/inventory/verificar-check";
import { ROTULO_NIVEL, type NivelCompatibilidade } from "@/domain/compatibility/types";
import type { Componente } from "@/domain/compatibility/types";
import { formatarMoeda, formatarNumero } from "@/lib/format";
import { can } from "@/lib/auth/permissions";
import { montarPainelDeSugestoes } from "@/server/services/build.service";
import { requireContext } from "@/server/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Montar com meu estoque" };
export const dynamic = "force-dynamic";

const COR_NIVEL: Record<NivelCompatibilidade, string> = {
  COMPATIBLE:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
  LIKELY_COMPATIBLE:
    "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-900",
  NEEDS_VERIFICATION:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  INCOMPATIBLE:
    "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900",
};

/**
 * "Montar com meu estoque".
 *
 * O veredito exibido vem inteiro do motor determinístico. A IA não participa
 * desta tela: aqui só aparecem fatos calculados a partir das especificações
 * cadastradas (seção 25).
 */
export default async function MontagensPage() {
  const [painel, ctx] = await Promise.all([
    montarPainelDeSugestoes(),
    requireContext(),
  ]);

  const podeVerificar = can(ctx.role, "build:write");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Montar com meu estoque
          </h1>
          <p className="text-muted-foreground text-sm">
            Combinações possíveis com as peças disponíveis agora. Cada sugestão
            usa peças diferentes — todas podem ser montadas ao mesmo tempo.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/*
            A tela abaixo sugere combinacoes. Esta leva ao caminho oposto e
            mais frequente: o PC ja foi montado e falta o estoque saber.
          */}
          {podeVerificar ? (
            <Link
              href="/montagens/nova"
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium"
            >
              <Wrench className="size-4" aria-hidden />
              Montar escolhendo as peças
            </Link>
          ) : null}
          <Link
            href="/montagens/minhas"
            className="text-muted-foreground hover:text-foreground text-sm underline"
          >
            Minhas montagens
          </Link>
        </div>
      </div>

      <section
        aria-label="Peças disponíveis"
        className="bg-card grid grid-cols-2 gap-px overflow-hidden rounded-lg border sm:grid-cols-4"
      >
        {painel.disponibilidade.map((item) => (
          <div key={item.papel} className="bg-card p-3">
            <p className="text-muted-foreground text-xs">{item.papel}</p>
            <p className="text-lg font-semibold tabular-nums">
              {formatarNumero(item.total)}
            </p>
          </div>
        ))}
      </section>

      {painel.gargalos.length > 0 ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
          <h2 className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
            <TriangleAlert className="size-4" aria-hidden />
            O que está limitando as montagens
          </h2>
          <ul className="mt-2 space-y-1.5 text-sm text-amber-900 dark:text-amber-200">
            {painel.gargalos.map((gargalo) => (
              <li key={gargalo.papel}>
                <strong>{gargalo.papel}</strong>: só {gargalo.disponiveis} em
                estoque.{" "}
                {gargalo.precisaComprarJunto.length > 0 ? (
                  <>
                    Comprar mais {gargalo.montagensBloqueadas} —{" "}
                    <em>
                      junto com {gargalo.precisaComprarJunto.join(" e ")}, que
                      também está no limite
                    </em>{" "}
                    — liberaria {gargalo.montagensBloqueadas} montagem(ns).
                  </>
                ) : (
                  <>
                    Comprar mais {gargalo.montagensBloqueadas} liberaria{" "}
                    {gargalo.montagensBloqueadas} montagem(ns).
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {painel.sugestoes.length === 0 ? (
        <div className="bg-card flex flex-col items-center gap-3 rounded-lg border px-6 py-16 text-center">
          <Cpu className="text-muted-foreground size-10" aria-hidden />
          <p className="font-medium">Nenhuma montagem possível hoje</p>
          <p className="text-muted-foreground max-w-md text-sm">
            É preciso ter pelo menos um processador e uma placa-mãe de sockets
            compatíveis disponíveis no estoque.
          </p>
          <Link
            href="/estoque/itens?status=AVAILABLE"
            className="text-sm underline"
          >
            Ver o que está disponível
          </Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {painel.sugestoes.map((sugestao, indice) => (
            <li
              key={sugestao.montagem.cpu?.id ?? indice}
              className="bg-card overflow-hidden rounded-lg border"
            >
              <header className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium">{sugestao.nivel}</h2>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-xs font-medium",
                        COR_NIVEL[sugestao.compatibilidade.nivel],
                      )}
                    >
                      {ROTULO_NIVEL[sugestao.compatibilidade.nivel]}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {sugestao.usosRecomendados.join(" · ")}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-medium tabular-nums">
                      {formatarMoeda(sugestao.valorDasPecas)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {sugestao.totalDePecas} peças ·{" "}
                      {sugestao.compatibilidade.consumoEstimadoW} W estimados
                    </p>
                  </div>
                  <SalvarMontagem
                    unitIds={idsDaMontagem(sugestao.montagem)}
                    nomeSugerido={nomeDaMontagem(sugestao)}
                    tier={sugestao.nivel}
                    useCase={sugestao.usosRecomendados[0] ?? ""}
                    valorSugerido={sugestao.valorDasPecas}
                    incompativel={
                      sugestao.compatibilidade.nivel === "INCOMPATIBLE"
                    }
                  />
                </div>
              </header>

              <div className="grid gap-4 p-4 md:grid-cols-2">
                <div>
                  <h3 className="text-muted-foreground mb-2 text-xs font-medium uppercase">
                    Componentes
                  </h3>
                  <dl className="space-y-1 text-sm">
                    <Papel rotulo="Processador" peca={sugestao.montagem.cpu} />
                    <Papel rotulo="Placa-mãe" peca={sugestao.montagem.motherboard} />
                    {sugestao.montagem.ram.map((pente, i) => (
                      <Papel key={pente.id} rotulo={`Memória ${i + 1}`} peca={pente} />
                    ))}
                    <Papel rotulo="Placa de vídeo" peca={sugestao.montagem.gpu} />
                    {sugestao.montagem.storage.map((disco, i) => (
                      <Papel key={disco.id} rotulo={`Disco ${i + 1}`} peca={disco} />
                    ))}
                    <Papel rotulo="Fonte" peca={sugestao.montagem.psu} />
                    <Papel rotulo="Gabinete" peca={sugestao.montagem.case} />
                    <Papel rotulo="Cooler" peca={sugestao.montagem.cooler} />
                  </dl>
                </div>

                <div>
                  <h3 className="text-muted-foreground mb-2 text-xs font-medium uppercase">
                    Verificação de compatibilidade
                  </h3>

                  {sugestao.compatibilidade.pecasFaltando.length > 0 ? (
                    <p className="mb-2 flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      Faltam: {sugestao.compatibilidade.pecasFaltando.join(", ")}.
                    </p>
                  ) : null}

                  <ul className="space-y-1.5 text-sm">
                    {sugestao.compatibilidade.checks
                      // Os acertos não precisam de espaço: o que importa é o
                      // que exige atenção.
                      .filter((check) => check.nivel !== "COMPATIBLE")
                      .map((check) => (
                        <li key={check.regra} className="flex gap-2">
                          <span
                            className={cn(
                              "mt-1.5 size-1.5 shrink-0 rounded-full",
                              check.nivel === "INCOMPATIBLE"
                                ? "bg-red-500"
                                : check.nivel === "NEEDS_VERIFICATION"
                                  ? "bg-amber-500"
                                  : "bg-sky-500",
                            )}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span className="text-muted-foreground block">
                              {check.mensagem}
                            </span>
                            {/* So aparece quando a regra declara sobre qual
                                peca fala: sem sujeito nao ha o que conferir. */}
                            {check.nivel === "NEEDS_VERIFICATION" &&
                            check.subjectId &&
                            podeVerificar ? (
                              <span className="mt-1.5 block">
                                <VerificarCheck
                                  ruleKey={check.regra}
                                  unitId={check.subjectId}
                                  titulo={check.titulo}
                                  contexto={check.mensagem}
                                />
                              </span>
                            ) : null}
                          </span>
                        </li>
                      ))}

                    {sugestao.compatibilidade.checks.every(
                      (check) => check.nivel === "COMPATIBLE",
                    ) && sugestao.compatibilidade.pecasFaltando.length === 0 ? (
                      <li className="text-emerald-700 dark:text-emerald-400">
                        Todas as {sugestao.compatibilidade.checks.length}{" "}
                        verificações passaram. Fonte recomendada:{" "}
                        {sugestao.compatibilidade.fonteRecomendadaW} W.
                      </li>
                    ) : null}
                  </ul>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-muted-foreground text-xs leading-relaxed">
        As verificações vêm de regras determinísticas aplicadas às
        especificações cadastradas — nenhuma é gerada por IA. Quando um campo
        necessário está vazio, o resultado é &quot;precisa verificar&quot;, nunca
        &quot;compatível&quot;.
      </p>
    </div>
  );
}

/** Ids das unidades que compoem a montagem, na ordem dos papeis. */
function idsDaMontagem(montagem: {
  cpu?: Componente | undefined;
  motherboard?: Componente | undefined;
  gpu?: Componente | undefined;
  psu?: Componente | undefined;
  case?: Componente | undefined;
  cooler?: Componente | undefined;
  ram: Componente[];
  storage: Componente[];
}): string[] {
  return [
    montagem.cpu,
    montagem.motherboard,
    montagem.gpu,
    montagem.psu,
    montagem.case,
    montagem.cooler,
    ...montagem.ram,
    ...montagem.storage,
  ]
    .filter((peca): peca is Componente => Boolean(peca))
    .map((peca) => peca.id);
}

/** Nome inicial da montagem: processador e placa de video dizem o essencial. */
function nomeDaMontagem(sugestao: {
  nivel: string;
  montagem: { cpu?: Componente | undefined; gpu?: Componente | undefined };
}): string {
  const partes = [sugestao.nivel];
  if (sugestao.montagem.cpu) partes.push(sugestao.montagem.cpu.nome);
  if (sugestao.montagem.gpu) partes.push(sugestao.montagem.gpu.nome);
  return partes.join(" · ");
}

function Papel({
  rotulo,
  peca,
}: {
  rotulo: string;
  peca?: { id: string; nome: string } | undefined;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground shrink-0">{rotulo}</dt>
      <dd className="min-w-0 truncate text-right">
        {peca ? (
          <Link href={`/estoque/itens/${peca.id}`} className="hover:underline">
            {peca.nome}
          </Link>
        ) : (
          <span className="text-muted-foreground/60">—</span>
        )}
      </dd>
    </div>
  );
}
