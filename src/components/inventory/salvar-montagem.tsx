"use client";

import { Check, Loader2, Save } from "lucide-react";
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
import { useOnlineStatus } from "@/hooks/use-online-status";
import { salvarMontagem } from "@/server/actions/build.actions";

/**
 * Confirma uma montagem sugerida e reserva as peças.
 *
 * Reserva, e não retirada: as peças voltam ao estoque se a montagem for
 * cancelada. Montagem cancelada é situação comum — cliente desiste, aparece
 * configuração melhor — e retirar seria irreversível.
 */
export function SalvarMontagem({
  unitIds,
  nomeSugerido,
  tier,
  useCase,
  valorSugerido,
  incompativel,
  jaMontado = false,
  aoSalvar,
}: {
  unitIds: string[];
  nomeSugerido: string;
  tier: string;
  useCase: string;
  valorSugerido: number;
  /** Quando o motor reprovou a configuração, o botão avisa antes de deixar salvar. */
  incompativel: boolean;
  /**
   * O PC já existe montado, e o registro só está alcançando a realidade.
   *
   * Muda o texto e o estado inicial: "reservar" descreve peças separadas para
   * um PC futuro, e usar essa palavra para uma máquina que já está ligada na
   * bancada faria a tela descrever uma situação que não é a verdadeira.
   */
  jaMontado?: boolean;
  /**
   * Chamado depois que o servidor confirmou a gravação.
   *
   * Serve para a tela de montagem manual descartar o rascunho guardado. Sem
   * isto, a próxima montagem abriria com as peças da anterior já marcadas — e
   * elas nem estariam mais disponíveis.
   */
  aoSalvar?: () => void;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [salvando, iniciarSalvamento] = useTransition();
  const { online } = useOnlineStatus();

  const [nome, setNome] = useState(nomeSugerido);
  const [cliente, setCliente] = useState("");
  const [preco, setPreco] = useState(
    valorSugerido > 0 ? String(Math.round(valorSugerido)) : "",
  );

  function confirmar() {
    if (!online) {
      toast.error("Sem conexão", {
        description:
          "A reserva das peças só vale com confirmação do servidor. Tente quando a conexão voltar.",
      });
      return;
    }

    iniciarSalvamento(async () => {
      const resultado = await salvarMontagem({
        name: nome,
        customerName: cliente || undefined,
        salePrice: preco || undefined,
        tier,
        useCase,
        unitIds,
        status: jaMontado ? "ASSEMBLED" : "RESERVED",
      });

      if (!resultado.ok) {
        toast.error("Não foi possível salvar", { description: resultado.error });
        return;
      }

      aoSalvar?.();

      toast.success(jaMontado ? "Montagem registrada" : "Montagem reservada", {
        description: `${resultado.data.pecasAlocadas} peças saíram do estoque disponível e voltam se você cancelar.`,
      });
      setAberto(false);
      router.push("/montagens/minhas");
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="outline" className="h-10" />}>
        <Save className="size-4" aria-hidden />
        {jaMontado ? "Salvar montagem" : "Reservar esta montagem"}
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {jaMontado ? "Salvar montagem" : "Reservar montagem"}
          </DialogTitle>
          <DialogDescription>
            {jaMontado
              ? `As ${unitIds.length} peças passam para "em montagem" e cada uma
                 passa a mostrar em qual PC está. Cancelar devolve todas.`
              : `As ${unitIds.length} peças ficam reservadas e saem do estoque
                 disponível. Cancelar a montagem devolve todas.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-4">
          {incompativel ? (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
              O motor reprovou esta configuração. Você ainda pode reservar as
              peças — às vezes é o que se quer, para resolver o problema depois —
              mas ela não deve ser montada como está.
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="montagem-nome">Nome da montagem</Label>
            <Input
              id="montagem-nome"
              className="h-11"
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="montagem-cliente">Cliente (opcional)</Label>
              <Input
                id="montagem-cliente"
                className="h-11"
                value={cliente}
                onChange={(evento) => setCliente(evento.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="montagem-preco">Preço de venda pretendido</Label>
              <Input
                id="montagem-preco"
                inputMode="decimal"
                className="h-11"
                value={preco}
                onChange={(evento) => setPreco(evento.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>

          <Button
            className="h-11 w-full"
            onClick={confirmar}
            disabled={salvando || nome.trim().length < 2}
          >
            {salvando ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Reservando…
              </>
            ) : (
              <>
                <Check className="size-4" aria-hidden />
                Reservar {unitIds.length} peças
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
