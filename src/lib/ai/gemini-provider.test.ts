import { afterEach, describe, expect, it, vi } from "vitest";

import { GeminiProvider } from "./gemini-provider";

/**
 * A troca de modelo existe por um motivo prático: na camada gratuita a cota é
 * por modelo, e "limite atingido" no principal não quer dizer que a chave
 * acabou. Os testes cobrem a troca e o que NÃO deve trocar.
 */

const ok = (texto: string) =>
  new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: texto }] } }] }),
    { status: 200 },
  );
const erro = (status: number) =>
  new Response(JSON.stringify({ error: { message: `HTTP ${status}` } }), {
    status,
  });

const pedido = { mensagens: [{ papel: "user" as const, texto: "oi" }] };

function modeloDaUrl(url: unknown): string {
  return String(url).match(/models\/([^:]+):/)![1]!;
}

afterEach(() => vi.unstubAllGlobals());

describe("modelos de reserva", () => {
  it("passa para o próximo modelo quando o principal bate no limite", async () => {
    const chamados: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        const modelo = modeloDaUrl(url);
        chamados.push(modelo);
        return modelo === "principal-a" ? erro(429) : ok("resposta da reserva");
      }),
    );

    const ia = new GeminiProvider("chave", "principal-a", ["reserva-a"]);
    const resposta = await ia.gerar(pedido);

    expect(resposta.texto).toBe("resposta da reserva");
    expect(resposta.modelo).toBe("reserva-a");
    expect(chamados).toEqual(["principal-a", "reserva-a"]);
  });

  it("modelo esgotado há pouco vai para o fim da fila", async () => {
    const chamados: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        const modelo = modeloDaUrl(url);
        chamados.push(modelo);
        return modelo === "principal-b" ? erro(429) : ok("ok");
      }),
    );

    const ia = new GeminiProvider("chave", "principal-b", ["reserva-b"]);
    await ia.gerar(pedido);
    chamados.length = 0;
    await ia.gerar(pedido);

    expect(chamados).toEqual(["reserva-b"]);
  });

  it("erro que não é de cota não troca de modelo", async () => {
    const chamados: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        chamados.push(modeloDaUrl(url));
        return erro(400);
      }),
    );

    const ia = new GeminiProvider("chave", "principal-c", ["reserva-c"]);
    await expect(ia.gerar(pedido)).rejects.toThrow();
    expect(chamados).toEqual(["principal-c"]);
  });

  it("todos esgotados: avisa que o limite é de todos os modelos", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => erro(429)));

    const ia = new GeminiProvider("chave", "principal-d", ["reserva-d"]);
    await expect(ia.gerar(pedido)).rejects.toThrow(/todos os modelos/);
  });
});
