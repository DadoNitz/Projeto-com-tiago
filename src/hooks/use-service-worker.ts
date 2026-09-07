"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Registro do Service Worker e detecção de nova versão (seção 33).
 *
 * O ponto delicado é a atualização. Um `skipWaiting()` automático troca os
 * assets embaixo de uma página já aberta — no meio de um cadastro, isso
 * significa perder o formulário. Então o worker novo fica em `waiting`, a
 * interface avisa, e a troca só acontece quando o usuário aceita.
 */
export function useServiceWorker(): {
  atualizacaoDisponivel: boolean;
  aplicarAtualizacao: () => void;
  limparCaches: () => void;
} {
  const [atualizacaoDisponivel, setAtualizacaoDisponivel] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const recarregandoRef = useRef(false);

  useEffect(() => {
    // Os arquivos do servidor de desenvolvimento não têm hashes imutáveis.
    // Cacheá-los mistura versões antigas de JS/CSS com a interface nova.
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    let cancelado = false;

    function observarWaiting(registration: ServiceWorkerRegistration) {
      if (registration.waiting && navigator.serviceWorker.controller) {
        setAtualizacaoDisponivel(true);
      }
    }

    async function registrar() {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        if (cancelado) return;

        registrationRef.current = registration;
        observarWaiting(registration);

        registration.addEventListener("updatefound", () => {
          const instalando = registration.installing;
          if (!instalando) return;

          instalando.addEventListener("statechange", () => {
            // `controller` presente significa que já havia um worker ativo:
            // este é um update, não a primeira instalação.
            if (
              instalando.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setAtualizacaoDisponivel(true);
            }
          });
        });
      } catch (erro) {
        // Falha ao registrar não pode derrubar a aplicação: sem PWA ela
        // continua funcionando normalmente como site.
        console.warn("[pwa] falha ao registrar o service worker:", erro);
      }
    }

    void registrar();

    // Quando o worker novo assume, recarregamos uma única vez para que a
    // página passe a usar os assets novos de forma consistente.
    function aoTrocarController() {
      if (recarregandoRef.current) return;
      recarregandoRef.current = true;
      window.location.reload();
    }

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      aoTrocarController,
    );

    return () => {
      cancelado = true;
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        aoTrocarController,
      );
    };
  }, []);

  const aplicarAtualizacao = useCallback(() => {
    const waiting = registrationRef.current?.waiting;
    if (!waiting) {
      window.location.reload();
      return;
    }
    waiting.postMessage({ type: "SKIP_WAITING" });
  }, []);

  /** Chamado no logout: nada do usuário anterior pode ficar na máquina. */
  const limparCaches = useCallback(() => {
    navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_CACHES" });
  }, []);

  return { atualizacaoDisponivel, aplicarAtualizacao, limparCaches };
}
