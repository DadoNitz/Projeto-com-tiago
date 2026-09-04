"use client";

import { KeyRound, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trocarMinhaSenha } from "@/server/actions/user.actions";

/**
 * Troca da propria senha.
 *
 * A senha atual e exigida de proposito: sem isso, quem encontrasse uma sessao
 * aberta numa maquina destravada trocaria a senha e tomaria a conta.
 */
export function TrocarSenha() {
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [salvando, iniciar] = useTransition();

  const naoConfere = confirmacao.length > 0 && confirmacao !== novaSenha;

  function enviar() {
    iniciar(async () => {
      const resultado = await trocarMinhaSenha({ senhaAtual, novaSenha });

      if (!resultado.ok) {
        toast.error("Nao foi possivel trocar", { description: resultado.error });
        return;
      }

      toast.success("Senha trocada", {
        description: "Use a nova senha no proximo acesso.",
      });
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmacao("");
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="senha-atual">Senha atual</Label>
        <Input
          id="senha-atual"
          type="password"
          autoComplete="current-password"
          className="h-11"
          value={senhaAtual}
          onChange={(evento) => setSenhaAtual(evento.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="senha-nova">Nova senha</Label>
          <Input
            id="senha-nova"
            type="password"
            autoComplete="new-password"
            className="h-11"
            value={novaSenha}
            onChange={(evento) => setNovaSenha(evento.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            Minimo de 10 caracteres.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="senha-confirma">Repita a nova senha</Label>
          <Input
            id="senha-confirma"
            type="password"
            autoComplete="new-password"
            className="h-11"
            aria-invalid={naoConfere}
            value={confirmacao}
            onChange={(evento) => setConfirmacao(evento.target.value)}
          />
          {naoConfere ? (
            <p className="text-destructive text-xs">As senhas nao conferem.</p>
          ) : null}
        </div>
      </div>

      <Button
        className="h-11"
        onClick={enviar}
        disabled={
          salvando ||
          senhaAtual.length === 0 ||
          novaSenha.length < 10 ||
          novaSenha !== confirmacao
        }
      >
        {salvando ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <KeyRound className="size-4" aria-hidden />
        )}
        Trocar senha
      </Button>
    </div>
  );
}
