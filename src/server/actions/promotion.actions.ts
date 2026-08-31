"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  arquivarPromocao,
  avaliarPromocao,
  registrarPromocao,
  type AvaliacaoDaPromocao,
} from "@/server/services/promotion.service";

import { runAction, type ActionResult } from "./run-action";

/** Server Actions de promocoes. */

const dinheiro = z
  .union([z.string(), z.number()])
  .transform((valor, ctx) => {
    if (valor === "" || valor === undefined) return undefined;
    const numero =
      typeof valor === "number"
        ? valor
        : Number(String(valor).replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(numero) || numero < 0) {
      ctx.addIssue({ code: "custom", message: "Valor invalido." });
      return undefined;
    }
    return Math.round(numero * 100) / 100;
  })
  .optional();

export async function novaPromocao(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const resultado = await runAction(
    {
      permission: "inventory:write",
      schema: z.object({
        title: z.string().trim().min(3, "Descreva a oferta.").max(200),
        storeName: z.string().trim().max(80).optional(),
        categorySlug: z.string().optional(),
        currentPrice: z.coerce.number().min(0),
        regularPrice: dinheiro,
        url: z.union([z.literal(""), z.string().url("Link invalido.")]).optional(),
        coupon: z.string().trim().max(40).optional(),
        cashbackPct: z.coerce.number().min(0).max(100).optional(),
        shippingCost: dinheiro,
      }),
      handler: (dados, ctx) =>
        registrarPromocao(
          {
            title: dados.title,
            storeName: dados.storeName,
            categorySlug: dados.categorySlug,
            currentPrice: dados.currentPrice,
            regularPrice: dados.regularPrice,
            url: dados.url,
            coupon: dados.coupon,
            cashbackPct: dados.cashbackPct,
            shippingCost: dados.shippingCost,
          },
          ctx,
        ),
    },
    input,
  );

  if (resultado.ok) revalidatePath("/promocoes");
  return resultado;
}

export async function avaliar(
  input: unknown,
): Promise<ActionResult<AvaliacaoDaPromocao>> {
  const resultado = await runAction(
    {
      permission: "ai:use",
      schema: z.object({ id: z.string().min(1) }),
      handler: (dados, ctx) => avaliarPromocao(dados.id, ctx),
    },
    input,
  );

  if (resultado.ok) revalidatePath("/promocoes");
  return resultado;
}

export async function arquivar(input: unknown): Promise<ActionResult<null>> {
  const resultado = await runAction(
    {
      permission: "inventory:write",
      schema: z.object({ id: z.string().min(1) }),
      async handler(dados, ctx) {
        await arquivarPromocao(dados.id, ctx);
        return null;
      },
    },
    input,
  );

  if (resultado.ok) revalidatePath("/promocoes");
  return resultado;
}
