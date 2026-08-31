import { redirect } from "next/navigation";

/**
 * A raiz nao tem conteudo proprio: o sistema comeca no dashboard.
 * Quem nao tem sessao e desviado para o login pelo proxy.
 */
export default function Home() {
  redirect("/dashboard");
}
