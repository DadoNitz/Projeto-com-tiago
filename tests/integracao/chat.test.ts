import { beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/client";
import { perguntarAoAssistente } from "@/server/services/ai-chat.service";
import type { ActionContext } from "@/server/session";

/**
 * Chat consultando o estoque real pelas ferramentas.
 *
 * O que importa verificar aqui nao e a redacao da resposta, e sim que o modelo
 * REALMENTE consultou o banco em vez de responder de memoria — e que os
 * numeros que ele cita existem.
 */
/**
 * Testes que chamam o modelo de verdade sao opt-in.
 *
 * Cada execucao consome cota do plano gratuito, que e por minuto e por dia.
 * Rodar a suite inteira algumas vezes seguidas esgota o limite e passa a
 * falhar por 429 — uma falha que nao diz nada sobre o codigo.
 *
 * Rodar com:  TESTAR_IA=1 npm test
 */
const temChave =
  Boolean(process.env.GEMINI_API_KEY) && process.env.TESTAR_IA === "1";

let ctx: ActionContext;

beforeAll(async () => {
  if (!temChave) return;
  const usuario = await prisma.user.findFirstOrThrow({
    where: { role: "ADMIN" },
    select: { id: true, name: true, role: true },
  });
  ctx = {
    userId: usuario.id,
    role: usuario.role,
    name: usuario.name,
    ip: null,
    userAgent: "vitest",
  };
});

describe.skipIf(!temChave)("chat com o estoque", () => {
  it("consulta as ferramentas antes de responder sobre montagens", async () => {
    const resposta = await perguntarAoAssistente(
      { pergunta: "Quais computadores consigo montar hoje com o que tenho?" },
      ctx,
    );

    console.log("--- ferramentas:", resposta.ferramentasUsadas.join(", "));
    console.log("--- resposta:\n" + resposta.texto);

    expect(resposta.ferramentasUsadas.length).toBeGreaterThan(0);
    expect(resposta.texto.length).toBeGreaterThan(40);
  });

  it("responde valores do estoque a partir dos dados reais", async () => {
    const resposta = await perguntarAoAssistente(
      { pergunta: "Quantas placas de video eu tenho disponiveis e quais sao?" },
      ctx,
    );

    console.log("--- ferramentas:", resposta.ferramentasUsadas.join(", "));
    console.log("--- resposta:\n" + resposta.texto);

    expect(resposta.ferramentasUsadas.length).toBeGreaterThan(0);
    // As GPUs do seed precisam aparecer pelo nome.
    expect(resposta.texto.toLowerCase()).toMatch(/rtx|gtx/);
  });

  it("identifica gargalos consultando o motor", async () => {
    const resposta = await perguntarAoAssistente(
      { pergunta: "O que esta me impedindo de montar mais computadores?" },
      ctx,
    );

    console.log("--- ferramentas:", resposta.ferramentasUsadas.join(", "));
    console.log("--- resposta:\n" + resposta.texto);

    expect(resposta.ferramentasUsadas.length).toBeGreaterThan(0);
  });
});
