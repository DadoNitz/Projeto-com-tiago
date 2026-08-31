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
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <div className="bg-primary text-primary-foreground mx-auto flex size-12 items-center justify-center rounded-xl">
            <CircuitBoard className="size-7" aria-hidden />
          </div>
          <h1 className="text-xl font-semibold">Estoque de Hardware</h1>
          <p className="text-muted-foreground text-sm">
            Entre para consultar e movimentar o estoque.
          </p>
        </div>

        <LoginForm />
      </div>
    </main>
  );
}
