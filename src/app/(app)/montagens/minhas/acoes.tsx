"use client";

import { Loader2, Undo2, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { cancelar, vender } from "@/server/actions/build.actions";

/**
 * Ações sobre uma montagem existente.
 *
 * As duas são irreversíveis do ponto de vista do usuário — cancelar devolve
 * as peças, vender as retira em definitivo — então ambas exigem confirmação
 * explícita, com o efeito descrito antes de acontecer.
 */

export function CancelarMontagem({
  buildId,
  totalDePecas,
}: {
  buildId: string;
  totalDePecas: number;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [executando, iniciar] = useTransition();
  const { online } = useOnlineStatus();

  function confirmar() {
    if (!online) {
      toast.error("Sem conexão", {
        description: "A devolução das peças precisa de confirmação do servidor.",
      });
      return;
    }

    iniciar(async () => {
      const resultado = await cancelar({ buildId, motivo: motivo || undefined });

      if (!resultado.ok) {
        toast.error("Não foi possível cancelar", {
          description: resultado.error,
        });
        return;
      }

      toast.success("Montagem cancelada", {
        description: `${resultado.data.pecasDevolvidas} peças voltaram ao estoque disponível.`,
      });
      setAberto(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="outline" className="h-10" />}>
        <Undo2 className="size-4" aria-hidden />
        Cancelar
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar a montagem</DialogTitle>
          <DialogDescription>
            As {totalDePecas} peças voltam para o estoque disponível e podem ser
            usadas em outra montagem. O histórico de cada uma é preservado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-4">
          <div className="space-y-1.5">
            <Label htmlFor="motivo-cancelamento">Motivo (opcional)</Label>
            <Textarea
              id="motivo-cancelamento"
              rows={3}
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              placeholder="Cliente desistiu, peça com defeito…"
            />
          </div>

          <Button
            variant="destructive"
            className="h-11 w-full"
            onClick={confirmar}
            disabled={executando}
          >
            {executando ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Cancelando…
              </>
            ) : (
              `Cancelar e devolver ${totalDePecas} peças`
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function VenderMontagem({
  buildId,
  totalDePecas,
  precoSugerido,
  clienteAtual,
}: {
  buildId: string;
  totalDePecas: number;
  precoSugerido: number;
  clienteAtual: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [preco, setPreco] = useState(
    precoSugerido > 0 ? String(Math.round(precoSugerido)) : "",
  );
  const [cliente, setCliente] = useState(clienteAtual);
  const [executando, iniciar] = useTransition();
  const { online } = useOnlineStatus();

  function confirmar() {
    if (!online) {
      toast.error("Sem conexão", {
        description: "A venda precisa de confirmação do servidor.",
      });
      return;
    }

    iniciar(async () => {
      const resultado = await vender({
        buildId,
        salePrice: preco,
        customerName: cliente || undefined,
      });

      if (!resultado.ok) {
        toast.error("Não foi possível registrar a venda", {
          description: resultado.error,
        });
        return;
      }

      toast.success("Venda registrada", {
        description: `${resultado.data.pecasVendidas} peças saíram do estoque. O valor foi rateado entre elas pelo custo.`,
      });
      setAberto(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button className="h-10" />}>
        <Wallet className="size-4" aria-hidden />
        Registrar venda
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar a venda</DialogTitle>
          <DialogDescription>
            As {totalDePecas} peças saem do estoque em definitivo. O valor é
            rateado entre elas proporcionalmente ao custo de cada uma, para que
            o extrato por sócio fique correto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-4">
          <div className="space-y-1.5">
            <Label htmlFor="venda-preco">Valor da venda</Label>
            <Input
              id="venda-preco"
              inputMode="decimal"
              className="h-11"
              value={preco}
              onChange={(evento) => setPreco(evento.target.value)}
              placeholder="0,00"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="venda-cliente">Cliente (opcional)</Label>
            <Input
              id="venda-cliente"
              className="h-11"
              value={cliente}
              onChange={(evento) => setCliente(evento.target.value)}
            />
          </div>

          <Button
            className="h-11 w-full"
            onClick={confirmar}
            disabled={executando || preco.trim() === ""}
          >
            {executando ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Registrando…
              </>
            ) : (
              "Confirmar venda"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
