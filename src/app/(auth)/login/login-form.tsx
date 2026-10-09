"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";
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
  const [estado, acao, enviando] = useActionState<
    ResultadoLogin | null,
    FormData
  >(autenticar, null);

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

      {/*
        Input nativo, e não o Checkbox do Base UI: o formulário funciona sem
        JavaScript, e o nativo é enviado junto. O label inteiro é o alvo de
        toque (48px), não só a caixinha.
      */}
      <label
        htmlFor="lembrar"
        className="hover:bg-muted/60 -mx-2 flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-2 select-none"
      >
        <span className="relative flex size-5 shrink-0">
          <input
            id="lembrar"
            name="lembrar"
            type="checkbox"
            defaultChecked
            className="border-input checked:border-led checked:bg-led peer size-5 shrink-0 cursor-pointer appearance-none rounded-[6px] border-[1.5px] bg-card transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          />
          <Check
            aria-hidden
            strokeWidth={3}
            className="text-led-foreground pointer-events-none absolute inset-0 m-auto size-3.5 opacity-0 transition-opacity peer-checked:opacity-100"
          />
        </span>
        <span className="flex flex-col">
          <span className="text-sm font-semibold">Manter conectado</span>
          <span className="text-muted-foreground text-xs">
            Desmarque em celular que não é seu: a sessão acaba em 12 horas.
          </span>
        </span>
      </label>

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
