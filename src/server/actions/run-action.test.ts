import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

/**
 * Erros de validação que os formulários conseguem usar.
 *
 * O defeito que originou estes testes: a tela dizia "verifique os campos
 * destacados" e não destacava nenhum. `z.flattenError` achata apenas o
 * primeiro nível, e os schemas deste sistema são aninhados — `{ produto,
 * unidades }` — então o formulário procurava por `produto.name` e recebia
 * `produto`. Nenhuma chave batia, nada acendia, e a pessoa ficava sem saber o
 * que corrigir.
 *
 * Nada quebrava de forma visível: a action recusava corretamente, e só a
 * explicação sumia. É o tipo de falha que volta sem ninguém notar.
 */

vi.mock("@/server/session", () => ({
  requirePermission: vi.fn(() =>
    Promise.resolve({
      userId: "u1",
      role: "ADMIN",
      name: "Teste",
      ip: null,
      userAgent: null,
    }),
  ),
  NaoAutenticadoError: class extends Error {},
  SemPermissaoError: class extends Error {},
}));

const { runAction } = await import("./run-action");

const schemaAninhado = z.object({
  produto: z.object({
    name: z.string().min(2, "Dê um nome à peça."),
    categoryId: z.string().min(1, "Escolha a categoria."),
    specs: z.object({ vram: z.number().positive("VRAM inválida.") }).optional(),
  }),
  unidades: z.object({
    quantidade: z.number().int().positive("Quantidade precisa ser ao menos 1."),
  }),
});

function executar(input: unknown) {
  return runAction(
    {
      permission: "inventory:write",
      schema: schemaAninhado,
      handler: () => Promise.resolve(null),
    },
    input,
  );
}

describe("erros de campo em schema aninhado", () => {
  it("usa o caminho completo, e não só a raiz", async () => {
    const resultado = await executar({
      produto: { name: "x", categoryId: "cat-1" },
      unidades: { quantidade: 1 },
    });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;

    // A chave precisa ser exatamente a que o formulário procura.
    expect(resultado.fieldErrors).toHaveProperty("produto.name");
    // E não pode ser a raiz: era esse o defeito.
    expect(resultado.fieldErrors).not.toHaveProperty("produto");
  });

  it("aponta o campo dentro das especificações", async () => {
    // Specs são dinâmicas por categoria; sem o caminho completo não há como a
    // tela saber qual delas reprovou.
    const resultado = await executar({
      produto: { name: "RTX 3060", categoryId: "cat-1", specs: { vram: -4 } },
      unidades: { quantidade: 1 },
    });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.fieldErrors?.["produto.specs.vram"]).toEqual([
      "VRAM inválida.",
    ]);
  });

  it("reporta todos os campos com problema, não só o primeiro", async () => {
    const resultado = await executar({
      produto: { name: "", categoryId: "" },
      unidades: { quantidade: 0 },
    });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;

    expect(Object.keys(resultado.fieldErrors ?? {})).toEqual(
      expect.arrayContaining([
        "produto.name",
        "produto.categoryId",
        "unidades.quantidade",
      ]),
    );
  });
});

describe("a mensagem já diz o que houve", () => {
  it("com um campo só, mostra a mensagem dele", async () => {
    // "Verifique os campos destacados" obriga a procurar; a mensagem real
    // resolve sem caçar nada — ainda mais quando o campo está em outro passo.
    const resultado = await executar({
      produto: { name: "RTX 3060", categoryId: "" },
      unidades: { quantidade: 1 },
    });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toBe("Escolha a categoria.");
  });

  it("com vários, mostra o primeiro e avisa que há mais", async () => {
    const resultado = await executar({
      produto: { name: "", categoryId: "" },
      unidades: { quantidade: 0 },
    });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toMatch(/e mais 2 campo/);
  });
});
