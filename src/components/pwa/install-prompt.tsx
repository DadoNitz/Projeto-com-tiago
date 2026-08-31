"use client";

import { Download, Share, X } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

/**
 * Evento não padronizado do Chromium. Não existe no lib.dom, por isso o tipo
 * é declarado aqui em vez de recorrer a `any`.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const CHAVE_RECUSA = "pwa-instalacao-recusada";

/**
 * A instalabilidade é um sistema externo ao React: depende de um evento do
 * navegador, do modo de exibição e do localStorage. Modelada como store
 * externo, o componente fica sem efeitos e sem cascata de renderização.
 */
type Convite = { tipo: "nenhum" } | { tipo: "nativo" } | { tipo: "ios" };

const SEM_CONVITE: Convite = { tipo: "nenhum" };

let convite: Convite = SEM_CONVITE;
let eventoNativo: BeforeInstallPromptEvent | null = null;
const ouvintes = new Set<() => void>();
let iniciado = false;

function notificar(novo: Convite) {
  if (convite.tipo === novo.tipo) return;
  convite = novo;
  for (const ouvinte of ouvintes) ouvinte();
}

function jaRecusou(): boolean {
  try {
    return localStorage.getItem(CHAVE_RECUSA) === "1";
  } catch {
    // Modo privado ou armazenamento bloqueado: na dúvida, não insiste.
    return true;
  }
}

function registrarRecusa(): void {
  try {
    localStorage.setItem(CHAVE_RECUSA, "1");
  } catch {
    // Sem storage o convite reaparece na próxima visita. Aceitável.
  }
}

function ehIosSafari(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua);
  // Chrome e Firefox no iOS também usam WebKit, mas só o Safari oferece
  // "Adicionar à Tela de Início".
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return ios && safari;
}

function estaInstalado(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS expõe a informação por uma propriedade própria do Safari.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function aoPoderInstalar(evento: Event) {
  // Impede o banner nativo para exibirmos o nosso, no momento certo.
  evento.preventDefault();
  eventoNativo = evento as BeforeInstallPromptEvent;
  notificar({ tipo: "nativo" });
}

function iniciar() {
  if (iniciado) return;
  iniciado = true;

  if (estaInstalado() || jaRecusou()) return;

  window.addEventListener("beforeinstallprompt", aoPoderInstalar);

  // No iOS não existe API de instalação: só resta a instrução manual.
  if (ehIosSafari()) notificar({ tipo: "ios" });
}

function subscribe(ouvinte: () => void): () => void {
  iniciar();
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

function getSnapshot(): Convite {
  return convite;
}

function getServerSnapshot(): Convite {
  return SEM_CONVITE;
}

/**
 * Convite discreto para instalar (seção 33).
 *
 * Não aparece se já estiver instalado nem se o usuário já recusou uma vez —
 * a especificação pede explicitamente para não insistir.
 */
export function InstallPrompt() {
  const convite = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const instalar = useCallback(async () => {
    if (!eventoNativo) return;
    await eventoNativo.prompt();
    const { outcome } = await eventoNativo.userChoice;
    if (outcome === "dismissed") registrarRecusa();
    eventoNativo = null;
    notificar(SEM_CONVITE);
  }, []);

  const dispensar = useCallback(() => {
    registrarRecusa();
    eventoNativo = null;
    notificar(SEM_CONVITE);
  }, []);

  if (convite.tipo === "nenhum") return null;

  return (
    <div className="bg-card fixed inset-x-3 bottom-20 z-50 rounded-lg border p-3 shadow-lg sm:right-4 sm:left-auto sm:w-80 md:bottom-4">
      <div className="flex items-start gap-3">
        <Download
          className="text-muted-foreground mt-0.5 size-5 shrink-0"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Instalar o aplicativo</p>
          {convite.tipo === "ios" ? (
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              No iPhone, toque em{" "}
              <Share className="inline size-3 align-text-bottom" aria-hidden />{" "}
              <strong>Compartilhar</strong> e depois em{" "}
              <strong>Adicionar à Tela de Início</strong>.
            </p>
          ) : (
            <>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                Acesso rápido pela tela inicial, em tela cheia, como um app.
              </p>
              <Button
                size="sm"
                className="mt-2 h-8"
                onClick={() => void instalar()}
              >
                Instalar
              </Button>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={dispensar}
          aria-label="Dispensar"
          className="text-muted-foreground hover:text-foreground -m-1 shrink-0 p-1"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
