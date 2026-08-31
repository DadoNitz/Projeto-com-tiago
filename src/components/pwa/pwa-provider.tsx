"use client";

import { CloudOff, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useServiceWorker } from "@/hooks/use-service-worker";

/**
 * Avisos permanentes do PWA: nova versão disponível e estado da conexão.
 *
 * Ficam no topo, acima do conteúdo, porque os dois afetam a confiança no que
 * está na tela. Especialmente o offline: a seção 33 é explícita ao exigir que
 * o usuário saiba quando uma operação não pode ser concluída.
 */
export function PwaProvider({ children }: { children: React.ReactNode }) {
  const { atualizacaoDisponivel, aplicarAtualizacao } = useServiceWorker();
  const { estado } = useOnlineStatus();

  return (
    <>
      {atualizacaoDisponivel ? (
        <div className="bg-primary text-primary-foreground flex items-center justify-between gap-3 px-4 py-2 text-sm">
          <span className="flex items-center gap-2">
            <RefreshCw className="size-4 shrink-0" aria-hidden />
            Nova versão disponível.
          </span>
          <Button
            size="sm"
            variant="secondary"
            className="h-8"
            onClick={aplicarAtualizacao}
          >
            Atualizar
          </Button>
        </div>
      ) : null}

      {estado !== "online" ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 bg-amber-500 px-4 py-2 text-sm text-amber-950"
        >
          {estado === "reconectando" ? (
            <>
              <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
              Reconectando…
            </>
          ) : (
            <>
              <CloudOff className="size-4 shrink-0" aria-hidden />
              Você está offline. É possível consultar o que já está na tela, mas
              nenhuma alteração de estoque será gravada.
            </>
          )}
        </div>
      ) : null}

      {children}
    </>
  );
}
