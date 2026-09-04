"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  registrarVerificacao,
  removerVerificacao,
} from "@/server/services/verification.service";

import { runAction, type ActionResult } from "./run-action";

/**
 * Verificacoes manuais de compatibilidade.
 *
 * Exige a mesma permissao de montagem: quem monta e quem confere a peca na
 * bancada. Perfil de consulta nao registra verificacao.
 */

export async function confirmarVerificacao(
  input: unknown,
): Promise<ActionResult<null>> {
  const resultado = await runAction(
    {
      permission: "build:write",
      schema: z.object({
        ruleKey: z.string().min(1),
        unitId: z.string().min(1),
        reason: z
          .string()
          .trim()
          .min(5, "Descreva o que voce conferiu.")
          .max(300),
      }),
      async handler(dados, ctx) {
        await registrarVerificacao(dados, ctx);
        return null;
      },
    },
    input,
  );

  if (resultado.ok) {
    revalidatePath("/montagens");
    revalidatePath("/estoque/itens");
  }
  return resultado;
}

export async function desfazerVerificacao(
  input: unknown,
): Promise<ActionResult<null>> {
  const resultado = await runAction(
    {
      permission: "build:write",
      schema: z.object({
        ruleKey: z.string().min(1),
        unitId: z.string().min(1),
      }),
      async handler(dados, ctx) {
        await removerVerificacao(dados, ctx);
        return null;
      },
    },
    input,
  );

  if (resultado.ok) revalidatePath("/montagens");
  return resultado;
}
