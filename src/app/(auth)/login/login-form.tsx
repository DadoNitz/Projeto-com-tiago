"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { autenticar, type ResultadoLogin } from "@/server/actions/auth.actions";

/**
 * Formulário de login.
 *
 * Usa `useActionState`, que funciona mesmo sem JavaScript: o formulário é
 * enviado normalmente e a resposta volta renderizada. Num sistema usado em
 * depósito, com conexão instável, essa é a diferença entre conseguir entrar e
 * ficar olhando um botão que não responde.
 */
export function LoginForm() {
  const [estado, acao, enviando] = useActionState<ResultadoLogin | null, FormData>(
    autenticar,
    null,
  );

  return (
    <form action={acao} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          required
          // Teclado do celular já abre no formato certo e sem autocorreção,
          // que costuma estragar e-mail digitado na pressa.
          spellCheck={false}
          className="h-11"
          placeholder="seu@email.com"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11"
          placeholder="••••••••"
        />
      </div>

      {estado?.error ? (
        <p
          role="alert"
          className="text-destructive flex items-start gap-2 text-sm"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {estado.error}
        </p>
      ) : null}

      <Button type="submit" className="h-11 w-full" disabled={enviando}>
        {enviando ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Entrando…
          </>
        ) : (
          "Entrar"
        )}
      </Button>
    </form>
  );
}
