"use client";

import { LoaderCircle, RefreshCw, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatarMoeda } from "@/lib/format";
import type { ReferenciaDeMercado } from "@/lib/preco-de-mercado";
import { cn } from "@/lib/utils";
import {
  atualizarPrecosDeMercadoDoEstoque,
  buscarPrecoDeMercadoDaPeca,
} from "@/server/actions/reference-price.actions";

/**
 * Preço de mercado de referência, sempre apagado.
 *
 * A opacidade reduzida é o ponto: o número é uma estimativa buscada na
 * internet, nunca o valor que alguém digitou, e não pode ser confundido com
 * ele num relance.
 */

export function PrecoDeMercado({
  referencia,
  buscando,
  className,
}: {
  referencia: ReferenciaDeMercado;
  buscando: boolean;
  className?: string;
}) {
  if (buscando) {
    return (
      <span
        className={cn(
          "text-muted-foreground inline-flex items-center gap-1 text-[11px] opacity-70",
          className,
        )}
      >
        <LoaderCircle className="size-3 animate-spin" aria-hidden />
        buscando preço de mercado…
      </span>
    );
  }

  if (referencia.valor === null) {
    if (referencia.status === "NOT_FOUND" || referencia.status === "FAILED") {
      const texto =
        referencia.status === "NOT_FOUND"
          ? "sem anúncio parecido"
          : "não consegui buscar o preço";
      // Mesmo sem média, abrir mostra o que foi buscado e por que não deu.
      return referencia.dados ? (
        <DetalheDoPreco referencia={referencia}>
          <span
            className={cn(
              "text-muted-foreground text-[11px] underline decoration-dotted underline-offset-2 opacity-60",
              className,
            )}
          >
            {texto}
          </span>
        </DetalheDoPreco>
      ) : (
        <span
          className={cn("text-muted-foreground text-[11px] opacity-60", className)}
        >
          {texto}
        </span>
      );
    }
    return null;
  }

  return (
    <DetalheDoPreco referencia={referencia}>
      <span
        className={cn(
          "text-muted-foreground inline-flex items-center gap-1 rounded text-xs tabular-nums underline decoration-dotted underline-offset-2 opacity-60 hover:opacity-90",
          className,
        )}
        title="Estimativa buscada na internet — não é um valor cadastrado. Clique para ver os anúncios."
      >
        <TrendingUp className="size-3 shrink-0" aria-hidden />~
        {formatarMoeda(referencia.valor)}
        <span className="text-[10px]">
          {referencia.tipo === "USADO" ? "usado" : "novo"}
        </span>
      </span>
    </DetalheDoPreco>
  );
}

/**
 * Janela que mostra de onde saiu o preço de mercado: a busca feita, os
 * anúncios encontrados (os que entraram e os que ficaram de fora) e a conta.
 */
function DetalheDoPreco({
  referencia,
  children,
}: {
  referencia: ReferenciaDeMercado;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const dados = referencia.dados ?? null;
  const resumo = dados?.resumo ?? null;
  const anuncios = dados?.anuncios ?? [];
  const entraram = anuncios.filter((a) => a.entrou !== false).length;
  const sabeQuemEntrou = anuncios.some((a) => a.entrou !== undefined);
  const novo = (dados?.condicao ?? referencia.tipo) !== "USADO";

  return (
    <>
      <button
        type="button"
        onClick={(evento) => {
          evento.preventDefault();
          evento.stopPropagation();
          setAberto(true);
        }}
        className="-mx-1 rounded px-1 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label="Ver como o preço de mercado foi calculado"
      >
        {children}
      </button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Preço de mercado</DialogTitle>
            <DialogDescription>
              Estimativa buscada na internet — não é um valor cadastrado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-2xl font-semibold tabular-nums">
                {referencia.valor === null
                  ? "Sem média"
                  : `~${formatarMoeda(referencia.valor)}`}
              </p>
              <p className="text-muted-foreground text-xs">
                {novo ? "Preço de peça nova (lojas)" : "Preço de peça usada"}
                {referencia.em
                  ? ` · buscado em ${new Date(referencia.em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`
                  : ""}
              </p>
            </div>

            <section>
              <h3 className="mb-1 font-medium">Como a conta foi feita</h3>
              <ol className="text-muted-foreground list-decimal space-y-1 pl-5">
                <li>
                  Busquei por{" "}
                  <span className="text-foreground font-medium">
                    “{dados?.consulta ?? "—"}”
                  </span>{" "}
                  no Buscapé e no Mercado Livre
                  {dados?.encontrados !== undefined
                    ? ` e voltaram ${dados.encontrados} anúncios`
                    : ""}
                  .
                </li>
                <li>
                  Fiquei só com os da mesma peça: {anuncios.length}{" "}
                  {anuncios.length === 1 ? "anúncio" : "anúncios"}
                  {dados?.rigor === "aproximado"
                    ? " (busca aproximada: o modelo exato não apareceu o suficiente — confira os títulos)"
                    : ""}
                  . Saem PC completo, kit, lote, peça com defeito, acessório e
                  produto de outra categoria.
                </li>
                <li>
                  {resumo ? (
                    <>
                      Descartei os extremos (fora de 50%–170% da mediana e, com
                      10 ou mais, os 10% de cada ponta). Sobraram{" "}
                      <span className="text-foreground font-medium">
                        {resumo.amostras}
                      </span>
                      , de {formatarMoeda(resumo.minimo)} a{" "}
                      {formatarMoeda(resumo.maximo)}.
                    </>
                  ) : (
                    <>
                      Não publiquei média: precisa de pelo menos 3 anúncios da
                      mesma peça.
                    </>
                  )}
                </li>
                {resumo ? (
                  <li>
                    Média do que sobrou:{" "}
                    <span className="text-foreground font-medium">
                      {formatarMoeda(resumo.media)}
                    </span>{" "}
                    (mediana {formatarMoeda(resumo.mediana)}).
                  </li>
                ) : null}
              </ol>
            </section>

            {anuncios.length > 0 ? (
              <section>
                <h3 className="mb-1 font-medium">
                  Anúncios{" "}
                  {sabeQuemEntrou ? (
                    <span className="text-muted-foreground font-normal">
                      ({entraram} entraram na média)
                    </span>
                  ) : null}
                </h3>
                <ul className="divide-y rounded-md border">
                  {anuncios.map((anuncio, indice) => {
                    const ficouDeFora = anuncio.entrou === false;
                    return (
                      <li
                        key={`${anuncio.url}-${indice}`}
                        className={cn(
                          "flex items-baseline justify-between gap-3 px-3 py-2",
                          ficouDeFora && "opacity-45",
                        )}
                      >
                        <a
                          href={anuncio.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-w-0 hover:underline"
                        >
                          <span className="text-muted-foreground block text-[11px]">
                            {anuncio.fonte}
                            {ficouDeFora ? " · descartado (extremo)" : ""}
                          </span>
                          <span className="line-clamp-2">{anuncio.titulo}</span>
                        </a>
                        <span
                          className={cn(
                            "shrink-0 tabular-nums",
                            ficouDeFora && "line-through",
                          )}
                        >
                          {formatarMoeda(anuncio.preco)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {dados?.falhas && dados.falhas.length > 0 ? (
              <p className="text-muted-foreground text-xs">
                Não consultado:{" "}
                {dados.falhas.map((f) => `${f.fonte} (${f.motivo})`).join(" · ")}
              </p>
            ) : null}

            {!sabeQuemEntrou && anuncios.length > 0 ? (
              <p className="text-muted-foreground text-xs">
                Busca feita antes desta tela existir: clique em “Buscar de novo”
                na peça para ver quais anúncios entraram na média.
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Enquanto houver busca pendente na tela, recarrega os dados de tempos em
 * tempos — é assim que o "buscando…" vira preço sem a pessoa apertar F5.
 */
export function AtualizarEnquantoBusca({ ativo }: { ativo: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!ativo) return;
    const intervalo = setInterval(() => router.refresh(), 6_000);
    return () => clearInterval(intervalo);
  }, [ativo, router]);
  return null;
}

export function BotaoAtualizarPrecosDoEstoque() {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  return (
    <Button
      variant="outline"
      disabled={pendente}
      onClick={() =>
        iniciar(async () => {
          const resultado = await atualizarPrecosDeMercadoDoEstoque();
          if (!resultado.ok) {
            toast.error(resultado.error);
            return;
          }
          toast.success(
            `Buscando preço de mercado de ${resultado.data.produtos} ${
              resultado.data.produtos === 1 ? "modelo" : "modelos"
            }. Os valores aparecem conforme ficam prontos.`,
          );
          router.refresh();
        })
      }
    >
      {pendente ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <RefreshCw className="size-4" />
      )}
      Preços de mercado
    </Button>
  );
}

export function BotaoBuscarPrecoDaPeca({ unitId }: { unitId: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pendente}
      onClick={() =>
        iniciar(async () => {
          const resultado = await buscarPrecoDeMercadoDaPeca({ unitId });
          if (!resultado.ok) {
            toast.error(resultado.error);
          } else if (resultado.data.status === "OK") {
            toast.success("Preço de mercado atualizado.");
          } else if (resultado.data.status === "NOT_FOUND") {
            toast.info("Não achei anúncio parecido com esta peça.");
          } else {
            toast.error("As fontes de preço não responderam. Tente mais tarde.");
          }
          router.refresh();
        })
      }
    >
      {pendente ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <RefreshCw className="size-4" />
      )}
      {pendente ? "Buscando…" : "Buscar de novo"}
    </Button>
  );
}
