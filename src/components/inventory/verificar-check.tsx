"use client";

import { BadgeCheck, Loader2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { confirmarVerificacao } from "@/server/actions/verification.actions";

/**
 * Resolve um aviso de "precisa verificar" conferindo a peca fisicamente.
 *
 * Existe porque o aviso de BIOS da B450 reaparece em toda sugestao, para
 * sempre — mesmo depois de alguem ter aberto a maquina e conferido. Aviso
 * permanente que a pessoa aprende a ignorar deixa de proteger.
 *
 * Exige uma descricao do que foi conferido. Um clique em "ok" sem explicacao
 * seria indistinguivel de "silencie isso", e a trilha de auditoria nao teria
 * o que registrar.
 */
export function VerificarCheck({
  ruleKey,
  unitId,
  titulo,
  contexto,
}: {
  ruleKey: string;
  unitId: string;
  titulo: string;
  contexto: string;
}) {
  const router = useRouter();
  const { online } = useOnlineStatus();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [salvando, iniciar] = useTransition();

  function enviar() {
    if (!online) {
      toast.error("Sem conexao", {
        description: "A verificacao so e gravada com confirmacao do servidor.",
      });
      return;
    }

    iniciar(async () => {
      const resultado = await confirmarVerificacao({ ruleKey, unitId, reason: motivo });

      if (!resultado.ok) {
        toast.error("Nao foi possivel registrar", {
          description: resultado.error,
        });
        return;
      }

      toast.success("Verificacao registrada", {
        description: "O aviso nao reaparece para esta peca.",
      });
      setAberto(false);
      setMotivo("");
      router.refresh();
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={<Button variant="outline" size="sm" className="h-8" />}
      >
        <BadgeCheck className="size-3.5" aria-hidden />
        Ja verifiquei
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{contexto}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-4 pb-4">
          <div className="space-y-1.5">
            <Label htmlFor="ver-motivo">O que voce conferiu?</Label>
            <Textarea
              id="ver-motivo"
              rows={3}
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              placeholder="Ex.: BIOS na versao F65, ja compativel com Ryzen 5000."
            />
            <p className="text-muted-foreground text-xs">
              Fica registrado com seu nome e a data. Vale so para esta peca —
              outra igual continua pedindo verificacao.
            </p>
          </div>

          <Button
            className="h-11 w-full"
            onClick={enviar}
            disabled={salvando || motivo.trim().length < 5}
          >
            {salvando ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Registrando...
              </>
            ) : (
              <>
                <BadgeCheck className="size-4" aria-hidden />
                Registrar verificacao
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
