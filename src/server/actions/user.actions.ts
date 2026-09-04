"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { Role } from "@/generated/prisma/enums";
import {
  alterarPapel,
  criarUsuario,
  definirAtivo,
  redefinirSenha,
  trocarPropriaSenha,
} from "@/server/services/user.service";

import { runAction, type ActionResult } from "./run-action";

/** Server Actions de gestao de usuarios (secao 16). */

const senha = z.string().min(1, "Informe a senha.").max(200);

export async function novoUsuario(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const resultado = await runAction(
    {
      permission: "user:manage",
      schema: z.object({
        name: z.string().trim().min(2, "Informe o nome.").max(120),
        email: z.string().trim().email("E-mail invalido.").max(160),
        role: z.enum(Role),
        senha,
      }),
      handler: (dados, ctx) => criarUsuario(dados, ctx),
    },
    input,
  );

  if (resultado.ok) revalidatePath("/configuracoes/usuarios");
  return resultado;
}

export async function mudarPapel(input: unknown): Promise<ActionResult<null>> {
  const resultado = await runAction(
    {
      permission: "user:manage",
      schema: z.object({ userId: z.string().min(1), role: z.enum(Role) }),
      async handler(dados, ctx) {
        await alterarPapel(dados.userId, dados.role, ctx);
        return null;
      },
    },
    input,
  );

  if (resultado.ok) revalidatePath("/configuracoes/usuarios");
  return resultado;
}

export async function mudarSituacao(input: unknown): Promise<ActionResult<null>> {
  const resultado = await runAction(
    {
      permission: "user:manage",
      schema: z.object({ userId: z.string().min(1), active: z.boolean() }),
      async handler(dados, ctx) {
        await definirAtivo(dados.userId, dados.active, ctx);
        return null;
      },
    },
    input,
  );

  if (resultado.ok) revalidatePath("/configuracoes/usuarios");
  return resultado;
}

export async function resetarSenha(input: unknown): Promise<ActionResult<null>> {
  const resultado = await runAction(
    {
      permission: "user:manage",
      schema: z.object({ userId: z.string().min(1), novaSenha: senha }),
      async handler(dados, ctx) {
        await redefinirSenha(dados.userId, dados.novaSenha, ctx);
        return null;
      },
    },
    input,
  );

  if (resultado.ok) revalidatePath("/configuracoes/usuarios");
  return resultado;
}

/**
 * Troca da propria senha.
 *
 * Sem exigencia de permissao especial: qualquer pessoa logada pode trocar a
 * propria senha, e deve poder — inclusive o perfil de consulta.
 */
export async function trocarMinhaSenha(
  input: unknown,
): Promise<ActionResult<null>> {
  return runAction(
    {
      permission: "inventory:read",
      schema: z.object({ senhaAtual: senha, novaSenha: senha }),
      async handler(dados, ctx) {
        await trocarPropriaSenha(dados, ctx);
        return null;
      },
    },
    input,
  );
}
