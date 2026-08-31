"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  criarLocal,
  criarMarca,
  criarSocio,
  desativarSocio,
  excluirLocal,
  excluirMarca,
  reativarSocio,
  renomearMarca,
} from "@/server/services/catalog-write.service";

import { runAction, type ActionResult } from "./run-action";

/** Server Actions dos catalogos de apoio. Todas exigem catalog:write. */

const textoCurto = z.string().trim().max(120);
const opcional = z.string().trim().max(200).optional();

function revalidar() {
  revalidatePath("/configuracoes");
  revalidatePath("/estoque/novo");
  revalidatePath("/estoque/itens");
  revalidatePath("/socios");
}

export async function novaMarca(input: unknown): Promise<ActionResult<{ id: string }>> {
  const resultado = await runAction(
    {
      permission: "catalog:write",
      schema: z.object({
        name: textoCurto.min(1, "Informe o nome."),
        website: opcional,
      }),
      handler: (dados, ctx) => criarMarca(dados, ctx),
    },
    input,
  );
  if (resultado.ok) revalidar();
  return resultado;
}

export async function editarMarca(input: unknown): Promise<ActionResult<null>> {
  const resultado = await runAction(
    {
      permission: "catalog:write",
      schema: z.object({
        id: z.string().min(1),
        name: textoCurto.min(1, "Informe o nome."),
      }),
      async handler(dados, ctx) {
        await renomearMarca(dados, ctx);
        return null;
      },
    },
    input,
  );
  if (resultado.ok) revalidar();
  return resultado;
}

export async function removerMarca(input: unknown): Promise<ActionResult<null>> {
  const resultado = await runAction(
    {
      permission: "catalog:write",
      schema: z.object({ id: z.string().min(1) }),
      async handler(dados, ctx) {
        await excluirMarca(dados.id, ctx);
        return null;
      },
    },
    input,
  );
  if (resultado.ok) revalidar();
  return resultado;
}

export async function novoLocal(input: unknown): Promise<ActionResult<{ id: string }>> {
  const resultado = await runAction(
    {
      permission: "catalog:write",
      schema: z.object({
        name: textoCurto.min(1, "Informe o nome."),
        code: opcional,
        parentId: z.string().optional(),
        notes: opcional,
      }),
      handler: (dados, ctx) => criarLocal(dados, ctx),
    },
    input,
  );
  if (resultado.ok) revalidar();
  return resultado;
}

export async function removerLocal(input: unknown): Promise<ActionResult<null>> {
  const resultado = await runAction(
    {
      permission: "catalog:write",
      schema: z.object({ id: z.string().min(1) }),
      async handler(dados, ctx) {
        await excluirLocal(dados.id, ctx);
        return null;
      },
    },
    input,
  );
  if (resultado.ok) revalidar();
  return resultado;
}

export async function novoSocio(input: unknown): Promise<ActionResult<{ id: string }>> {
  const resultado = await runAction(
    {
      permission: "catalog:write",
      schema: z.object({
        name: textoCurto.min(1, "Informe o nome."),
        email: opcional,
        phone: opcional,
        notes: opcional,
      }),
      handler: (dados, ctx) => criarSocio(dados, ctx),
    },
    input,
  );
  if (resultado.ok) revalidar();
  return resultado;
}

export async function alternarSocio(input: unknown): Promise<ActionResult<null>> {
  const resultado = await runAction(
    {
      permission: "catalog:write",
      schema: z.object({ id: z.string().min(1), ativo: z.boolean() }),
      async handler(dados, ctx) {
        if (dados.ativo) await reativarSocio(dados.id, ctx);
        else await desativarSocio(dados.id, ctx);
        return null;
      },
    },
    input,
  );
  if (resultado.ok) revalidar();
  return resultado;
}
