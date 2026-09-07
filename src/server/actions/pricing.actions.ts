"use server";

import { z } from "zod";

import type { SugestaoDePreco } from "@/domain/pricing/preco-de-venda";
import {
  sugerirPrecoDeMontagem,
  sugerirPrecoDeUnidade,
} from "@/server/services/pricing.service";

import { runAction, type ActionResult } from "./run-action";

/**
 * Sugestão de preço para o anúncio.
 *
 * São duas actions, e não uma com um parâmetro de tipo, porque a permissão é
 * diferente: ver o preço de uma montagem é `build:read`, o de uma peça é
 * `inventory:read`. Uma action só teria de exigir a mais restritiva das duas
 * para todo mundo, ou verificar por dentro — que é justamente o que
 * `runAction` existe para não deixar acontecer.
 *
 * Não escrevem nada, então não revalidam rota nenhuma.
 */

const porId = z.object({ id: z.string().min(1) });

export async function sugerirPrecoDaMontagem(
  input: unknown,
): Promise<ActionResult<SugestaoDePreco | null>> {
  return runAction(
    {
      permission: "build:read",
      schema: porId,
      handler: (dados) => sugerirPrecoDeMontagem(dados.id),
    },
    input,
  );
}

export async function sugerirPrecoDaPeca(
  input: unknown,
): Promise<ActionResult<SugestaoDePreco | null>> {
  return runAction(
    {
      permission: "inventory:read",
      schema: porId,
      handler: (dados) => sugerirPrecoDeUnidade(dados.id),
    },
    input,
  );
}
