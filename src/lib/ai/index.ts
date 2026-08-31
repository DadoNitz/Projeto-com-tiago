import "server-only";

import { env } from "@/lib/env";

import { GeminiProvider } from "./gemini-provider";
import { IAIndisponivelError, type AIProvider } from "./types";

/**
 * Seleção do provedor de IA.
 *
 * Trocar de modelo é mudar duas variáveis de ambiente. Nenhum código de
 * negócio conhece o fornecedor.
 */

let instancia: AIProvider | null = null;

/** Erro lançado quando o sistema não tem IA configurada. */
export class IANaoConfiguradaError extends Error {
  constructor() {
    super(
      "Nenhuma chave de IA configurada. Defina GEMINI_API_KEY (obtenha em " +
        "https://aistudio.google.com/apikey) e AI_PROVIDER no ambiente.",
    );
    this.name = "IANaoConfiguradaError";
  }
}

/** `true` quando há provedor utilizável, para a UI esconder o que não funciona. */
export function iaDisponivel(): boolean {
  const { AI_PROVIDER, GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY } =
    env();

  switch (AI_PROVIDER) {
    case "gemini":
      return Boolean(GEMINI_API_KEY);
    case "openai":
      return Boolean(OPENAI_API_KEY);
    case "anthropic":
      return Boolean(ANTHROPIC_API_KEY);
  }
}

export function aiProvider(): AIProvider {
  if (instancia) return instancia;

  const { AI_PROVIDER, AI_MODEL, GEMINI_API_KEY } = env();

  if (AI_PROVIDER === "gemini") {
    if (!GEMINI_API_KEY) throw new IANaoConfiguradaError();
    instancia = new GeminiProvider(GEMINI_API_KEY, AI_MODEL);
    return instancia;
  }

  // OpenAI e Anthropic entram implementando a mesma interface. Não estão
  // implementados ainda, e falhar dizendo isso é melhor do que fingir que o
  // provedor existe e quebrar dentro da chamada.
  throw new IAIndisponivelError(
    AI_PROVIDER,
    "provedor ainda não implementado neste sistema",
  );
}

export { IAIndisponivelError, RespostaInvalidaError } from "./types";
export type { AIProvider, PedidoDeGeracao, RespostaDaIA } from "./types";
