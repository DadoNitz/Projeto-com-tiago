import { CloudOff } from "lucide-react";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sem conexão",
};

/**
 * Página servida pelo Service Worker quando uma navegação falha por falta de
 * rede.
 *
 * É estática de propósito: nenhum dado de usuário pode ficar guardado no
 * Cache Storage, que é compartilhado por origem entre todas as contas que
 * usarem o mesmo navegador.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <CloudOff className="text-muted-foreground size-12" aria-hidden />
      <h1 className="text-xl font-semibold">Sem conexão</h1>
      <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
        Não foi possível alcançar o servidor. O estoque só é exibido e alterado
        com conexão, para que nada apareça como concluído sem ter sido gravado.
      </p>
      <p className="text-muted-foreground text-sm">
        Assim que a conexão voltar, recarregue a página.
      </p>
    </main>
  );
}
