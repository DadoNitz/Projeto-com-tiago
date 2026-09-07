"use client";

import { Check, Cpu, Search, TriangleAlert, X } from "lucide-react";
import { useMemo, useState } from "react";

import { SalvarMontagem } from "@/components/inventory/salvar-montagem";
import { Input } from "@/components/ui/input";
import { avaliarCompatibilidade } from "@/domain/compatibility/engine";
import {
  ROTULO_NIVEL,
  type Componente,
  type MontagemCandidata,
  type NivelCompatibilidade,
} from "@/domain/compatibility/types";
import { formatarMoeda } from "@/lib/format";
import type { PecaParaMontar } from "@/server/services/build.service";
import { cn } from "@/lib/utils";

/**
 * Montagem escolhendo as peças à mão.
 *
 * A tela de sugestões responde "o que dá para montar com o que eu tenho?".
 * Esta responde outra pergunta, que é a mais comum na bancada: "montei este
 * PC, quais peças usei?". O computador já existe; o que falta é o estoque
 * saber disso.
 *
 * ## Por que o motor roda aqui, no navegador
 *
 * `avaliarCompatibilidade` é uma função pura, sem acesso a banco. Rodando no
 * cliente, o aviso de "esta RAM é DDR4 e a placa é DDR5" aparece no momento em
 * que você marca a peça — não depois de salvar. Descobrir depois é o caso em
 * que o estoque já foi alterado e precisa ser desfeito.
 *
 * ## Por que dá para salvar mesmo com incompatibilidade
 *
 * Porque o PC **já foi montado**. Se a máquina está ligada na bancada, uma
 * tela dizendo que a combinação é impossível não muda esse fato — só impediria
 * o registro, e o estoque continuaria dizendo que as peças estão na
 * prateleira. O aviso fica visível, o registro acontece, e a divergência vira
 * assunto para conferir a ficha técnica da peça.
 */

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

/** Ordem de montagem de verdade: começa pelo processador, termina nos extras. */
const ORDEM_DAS_CATEGORIAS = [
  "cpu",
  "motherboard",
  "ram",
  "gpu",
  "storage",
  "psu",
  "case",
  "cooler",
  "monitor",
  "peripheral",
] as const;

const ROTULO_CATEGORIA: Record<string, string> = {
  cpu: "Processador",
  motherboard: "Placa-mãe",
  ram: "Memória",
  gpu: "Placa de vídeo",
  storage: "Armazenamento",
  psu: "Fonte",
  case: "Gabinete",
  cooler: "Cooler",
  monitor: "Monitor",
  peripheral: "Periférico",
};

function rotulo(slug: string): string {
  return ROTULO_CATEGORIA[slug] ?? "Outros";
}

/** Categorias que o motor de compatibilidade sabe avaliar. */
const AVALIADAS = new Set([
  "cpu",
  "motherboard",
  "ram",
  "gpu",
  "storage",
  "psu",
  "case",
  "cooler",
]);

export function Montador({ pecas }: { pecas: PecaParaMontar[] }) {
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");

  function alternar(id: string) {
    setSelecionadas((atual) => {
      const proxima = new Set(atual);
      if (proxima.has(id)) proxima.delete(id);
      else proxima.add(id);
      return proxima;
    });
  }

  const porId = useMemo(
    () => new Map(pecas.map((peca) => [peca.id, peca])),
    [pecas],
  );

  const escolhidas = useMemo(
    () => [...selecionadas].map((id) => porId.get(id)).filter(Boolean) as PecaParaMontar[],
    [selecionadas, porId],
  );

  // Monta o formato que o motor espera. Só as categorias que ele avalia —
  // monitor e periférico entram na montagem, mas não têm regra de encaixe.
  const resultado = useMemo(() => {
    const comoComponente = (peca: PecaParaMontar): Componente => ({
      id: peca.id,
      nome: peca.nome,
      categorySlug: peca.categorySlug,
      specs: peca.specs,
    });

    const porPapel = (slug: string) =>
      escolhidas.filter((peca) => peca.categorySlug === slug).map(comoComponente);

    const candidata: MontagemCandidata = {
      cpu: porPapel("cpu")[0],
      motherboard: porPapel("motherboard")[0],
      ram: porPapel("ram"),
      gpu: porPapel("gpu")[0],
      storage: porPapel("storage"),
      psu: porPapel("psu")[0],
      case: porPapel("case")[0],
      cooler: porPapel("cooler")[0],
    };

    return avaliarCompatibilidade(candidata);
  }, [escolhidas]);

  const custoTotal = escolhidas.reduce((soma, peca) => soma + (peca.custo ?? 0), 0);
  const precoSugerido = escolhidas.reduce(
    (soma, peca) => soma + (peca.precoSugerido ?? peca.custo ?? 0),
    0,
  );

  const termo = busca.trim().toLowerCase();
  const visiveis = termo
    ? pecas.filter(
        (peca) =>
          peca.nome.toLowerCase().includes(termo) ||
          peca.codigo.toLowerCase().includes(termo),
      )
    : pecas;

  const agrupadas = useMemo(() => {
    const grupos = new Map<string, PecaParaMontar[]>();
    for (const peca of visiveis) {
      const lista = grupos.get(peca.categorySlug) ?? [];
      lista.push(peca);
      grupos.set(peca.categorySlug, lista);
    }

    const ordem = [...ORDEM_DAS_CATEGORIAS] as string[];
    return [...grupos.entries()].sort(([a], [b]) => {
      const ia = ordem.indexOf(a);
      const ib = ordem.indexOf(b);
      // Categoria fora da lista vai para o fim, em ordem alfabética.
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    });
  }, [visiveis]);

  const naoAvaliadas = escolhidas.filter(
    (peca) => !AVALIADAS.has(peca.categorySlug),
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        <div className="relative">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Buscar por nome ou código da etiqueta…"
            className="h-11 pl-9"
            aria-label="Buscar peça"
          />
        </div>

        {pecas.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
            Nenhuma peça disponível no estoque. Peças já reservadas, montadas ou
            vendidas não aparecem aqui.
          </p>
        ) : null}

        {pecas.length > 0 && visiveis.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
            Nada encontrado para “{busca}”.
          </p>
        ) : null}

        {agrupadas.map(([slug, lista]) => (
          <section key={slug}>
            <h2 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
              {rotulo(slug)}{" "}
              <span className="font-normal normal-case">({lista.length})</span>
            </h2>
            <ul className="space-y-2">
              {lista.map((peca) => {
                const marcada = selecionadas.has(peca.id);
                return (
                  <li key={peca.id}>
                    <button
                      type="button"
                      onClick={() => alternar(peca.id)}
                      aria-pressed={marcada}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition",
                        marcada
                          ? "border-sky-400 bg-sky-50 dark:border-sky-700 dark:bg-sky-950"
                          : "hover:bg-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border",
                          marcada
                            ? "border-sky-500 bg-sky-500 text-white"
                            : "border-muted-foreground/40",
                        )}
                        aria-hidden
                      >
                        {marcada ? <Check className="size-3.5" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {peca.nome}
                        </span>
                        <span className="text-muted-foreground block text-xs">
                          {peca.codigo}
                          {peca.local ? ` · ${peca.local}` : ""}
                          {peca.custo !== null
                            ? ` · custo ${formatarMoeda(peca.custo)}`
                            : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {/* Resumo. Fixo na lateral em tela grande, empilhado no celular. */}
      <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-lg border p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Cpu className="size-4" aria-hidden />
            {escolhidas.length === 0
              ? "Nenhuma peça escolhida"
              : `${escolhidas.length} peça(s)`}
          </h2>

          {escolhidas.length === 0 ? (
            <p className="text-muted-foreground mt-2 text-sm">
              Marque as peças que você usou neste PC. Elas passam para “em
              montagem” no estoque quando você salvar.
            </p>
          ) : (
            <>
              <ul className="mt-3 space-y-1.5">
                {escolhidas.map((peca) => (
                  <li
                    key={peca.id}
                    className="flex items-start justify-between gap-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">{peca.nome}</span>
                    <button
                      type="button"
                      onClick={() => alternar(peca.id)}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                      aria-label={`Tirar ${peca.nome} da montagem`}
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>

              <dl className="mt-3 space-y-1 border-t pt-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Custo das peças</dt>
                  <dd className="font-medium">{formatarMoeda(custoTotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Soma sugerida</dt>
                  <dd className="font-medium">{formatarMoeda(precoSugerido)}</dd>
                </div>
              </dl>
            </>
          )}
        </div>

        {escolhidas.length > 0 ? (
          <div className={cn("rounded-lg border p-4", COR_NIVEL[resultado.nivel])}>
            <p className="text-sm font-semibold">{ROTULO_NIVEL[resultado.nivel]}</p>

            {resultado.pecasFaltando.length > 0 ? (
              <p className="mt-1 text-xs">
                Faltando: {resultado.pecasFaltando.join(", ")}
              </p>
            ) : null}

            {resultado.consumoEstimadoW > 0 ? (
              <p className="mt-1 text-xs">
                Consumo estimado {resultado.consumoEstimadoW} W · fonte
                recomendada {resultado.fonteRecomendadaW} W
              </p>
            ) : null}

            <ul className="mt-2 space-y-1">
              {resultado.checks
                .filter(
                  (check) =>
                    check.nivel === "INCOMPATIBLE" ||
                    check.nivel === "NEEDS_VERIFICATION",
                )
                .slice(0, 6)
                .map((check, indice) => (
                  <li key={indice} className="flex items-start gap-1.5 text-xs">
                    <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
                    <span>{check.mensagem}</span>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}

        {naoAvaliadas.length > 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-xs">
            {naoAvaliadas.length === 1
              ? "1 peça entra na montagem"
              : `${naoAvaliadas.length} peças entram na montagem`}{" "}
            sem verificação de encaixe — monitor, periférico e afins não têm
            regra de compatibilidade.
          </p>
        ) : null}

        {escolhidas.length > 0 ? (
          <SalvarMontagem
            unitIds={escolhidas.map((peca) => peca.id)}
            nomeSugerido=""
            tier=""
            useCase=""
            valorSugerido={precoSugerido}
            incompativel={resultado.nivel === "INCOMPATIBLE"}
            jaMontado
          />
        ) : null}
      </aside>
    </div>
  );
}
