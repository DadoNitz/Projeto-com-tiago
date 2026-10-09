"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { prisma } from "@/server/db/client";
import { NaoEncontradoError } from "@/server/services/errors";
import {
  atualizarPrecoDeReferencia,
  marcarEstoqueInteiro,
  marcarPendentes,
  processarProdutos,
  type StatusDaReferencia,
} from "@/server/services/reference-price";

import { runAction, type ActionResult } from "./run-action";

/**
 * Gatilhos manuais do preço de mercado.
 *
 * O terceiro gatilho — cadastro de peça — fica em `inventory.actions.ts`,
 * junto do cadastro.
 */

/**
 * Busca de novo o preço de uma peça. Espera o resultado: é uma busca só, e
 * quem clicou está olhando a tela.
 */
export async function buscarPrecoDeMercadoDaPeca(
  input: unknown,
): Promise<ActionResult<{ status: StatusDaReferencia }>> {
  const resultado = await runAction(
    {
      permission: "inventory:write",
      schema: z.object({ unitId: z.string().min(1) }),
      async handler({ unitId }) {
        const unidade = await prisma.inventoryUnit.findUnique({
          where: { id: unitId },
          select: { productId: true },
        });
        if (!unidade) throw new NaoEncontradoError("Unidade de estoque");

        await marcarPendentes([unidade.productId]);
        return { status: await atualizarPrecoDeReferencia(unidade.productId) };
      },
    },
    input,
  );

  if (resultado.ok) {
    revalidatePath("/estoque/itens");
  }
  return resultado;
}

/**
 * Atualiza o preço de mercado de todo o estoque em segundo plano.
 *
 * Responde na hora com quantos modelos entraram na fila; a busca continua
 * depois da resposta, e a lista mostra "buscando…" até cada um terminar.
 */
export async function atualizarPrecosDeMercadoDoEstoque(): Promise<
  ActionResult<{ produtos: number }>
> {
  const resultado = await runAction(
    {
      permission: "inventory:write",
      schema: z.undefined().or(z.object({}).strict()),
      async handler() {
        const ids = await marcarEstoqueInteiro();
        after(() => processarProdutos(ids));
        return { produtos: ids.length };
      },
    },
    undefined,
  );

  if (resultado.ok) {
    revalidatePath("/estoque/itens");
  }
  return resultado;
}
