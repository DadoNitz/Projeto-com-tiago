"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { signIn, signOut } from "@/lib/auth";

/**
 * Ações de sessão.
 *
 * Ficam separadas das demais Server Actions porque não passam por
 * `runAction`: `runAction` exige uma sessão válida, e estas são justamente as
 * que criam e destroem a sessão.
 */

export interface ResultadoLogin {
  ok: boolean;
  error?: string;
}

export async function autenticar(
  _estadoAnterior: ResultadoLogin | null,
  formData: FormData,
): Promise<ResultadoLogin> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  // Checkbox desmarcado não é enviado pelo formulário: ausência = não lembrar.
  const lembrar = formData.get("lembrar") === "on" ? "1" : "0";

  if (!email || !password) {
    return { ok: false, error: "Informe e-mail e senha." };
  }

  try {
    await signIn("credentials", { email, password, lembrar, redirect: false });
  } catch (erro) {
    if (erro instanceof AuthError) {
      // Mensagem única para credencial inválida e usuário inexistente: dizer
      // "este e-mail não existe" entregaria a lista de contas a quem tentasse
      // adivinhar.
      return { ok: false, error: "E-mail ou senha incorretos." };
    }
    throw erro;
  }

  // `redirect` lança por dentro; precisa ficar fora do try, senão o catch
  // acima o trataria como falha de autenticação.
  redirect("/dashboard");
}

export async function encerrarSessao(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
