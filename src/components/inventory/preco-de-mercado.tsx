"use client";

import { LoaderCircle, RefreshCw, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
      return (
        <span
          className={cn("text-muted-foreground text-[11px] opacity-60", className)}
        >
          {referencia.status === "NOT_FOUND"
            ? "sem anúncio parecido"
            : "não consegui buscar o preço"}
        </span>
      );
    }
    return null;
  }

  return (
    <span
      className={cn(
        "text-muted-foreground inline-flex items-center gap-1 text-xs tabular-nums opacity-60",
        className,
      )}
      title="Estimativa buscada na internet — não é um valor cadastrado"
    >
      <TrendingUp className="size-3 shrink-0" aria-hidden />~
      {formatarMoeda(referencia.valor)}
      <span className="text-[10px]">
        {referencia.tipo === "USADO" ? "usado" : "novo"}
      </span>
    </span>
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
