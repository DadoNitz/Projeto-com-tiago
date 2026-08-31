"use client";

import { useCallback, useSyncExternalStore } from "react";

export type EstadoConexao = "online" | "offline" | "reconectando";

/**
 * Estado da conexão (seção 33).
 *
 * `navigator.onLine` sozinho mente com frequência: indica apenas que existe
 * uma interface de rede ativa, não que o servidor responde — um celular preso
 * num Wi-Fi sem saída para a internet aparece como "online". Por isso, ao
 * voltar o sinal, passamos por "reconectando" e só declaramos "online" depois
 * de uma checagem real contra o servidor.
 *
 * A conexão é um sistema externo ao React, então é modelada como um store
 * externo em vez de estado sincronizado por efeito. Além de ser o padrão
 * recomendado, evita a cascata de renderizações que `setState` dentro de
 * `useEffect` provoca.
 */

let estadoAtual: EstadoConexao = "online";
const ouvintes = new Set<() => void>();
let iniciado = false;

function notificar(novo: EstadoConexao) {
  if (estadoAtual === novo) return;
  estadoAtual = novo;
  for (const ouvinte of ouvintes) ouvinte();
}

/** Confirma se o servidor realmente responde. */
async function checarServidor(): Promise<boolean> {
  try {
    const resposta = await fetch("/api/health", {
      method: "HEAD",
      cache: "no-store",
    });
    notificar(resposta.ok ? "online" : "offline");
    return resposta.ok;
  } catch {
    notificar("offline");
    return false;
  }
}

function aoPerder() {
  notificar("offline");
}

function aoVoltar() {
  notificar("reconectando");
  void checarServidor();
}

function iniciar() {
  if (iniciado) return;
  iniciado = true;
  estadoAtual = navigator.onLine ? "online" : "offline";
  window.addEventListener("offline", aoPerder);
  window.addEventListener("online", aoVoltar);
}

function subscribe(ouvinte: () => void): () => void {
  iniciar();
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

function getSnapshot(): EstadoConexao {
  return estadoAtual;
}

/** No servidor não há como saber: assumimos online e corrigimos ao hidratar. */
function getServerSnapshot(): EstadoConexao {
  return "online";
}

export function useOnlineStatus(): {
  estado: EstadoConexao;
  online: boolean;
  verificar: () => Promise<boolean>;
} {
  const estado = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const verificar = useCallback(() => checarServidor(), []);

  return { estado, online: estado === "online", verificar };
}
