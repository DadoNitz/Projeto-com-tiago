import { CircuitBoard } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Entrar",
};

export default async function LoginPage() {
  // Quem já tem sessão não deve ver a tela de login.
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <div className="bg-card w-full max-w-sm space-y-7 rounded-3xl border p-6 sm:p-8">
        <div className="space-y-2 text-center">
          <div className="bg-primary text-primary-foreground mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl">
            <CircuitBoard className="size-7" aria-hidden />
          </div>
          <p className="text-primary text-xs font-semibold tracking-widest uppercase">
            Estoque de Hardware
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Bom ter você de volta
          </h1>
          <p className="text-muted-foreground text-sm">
            Entre para consultar e movimentar o estoque.
          </p>
        </div>

        <LoginForm />
      </div>
    </main>
  );
}
