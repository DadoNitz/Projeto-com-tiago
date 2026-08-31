import "server-only";

import { headers } from "next/headers";

import type { Role } from "@/generated/prisma/enums";
import { auth } from "@/lib/auth";
import { can, type Permission } from "@/lib/auth/permissions";

/**
 * Contexto de execução de uma operação de escrita.
 *
 * Carrega quem está agindo e de onde — é o que alimenta a auditoria
 * (seção 17) e o campo `userId` das movimentações.
 */
export interface ActionContext {
  userId: string;
  role: Role;
  name: string;
  ip: string | null;
  userAgent: string | null;
}

export class NaoAutenticadoError extends Error {
  constructor() {
    super("Sessão expirada ou inexistente. Faça login novamente.");
    this.name = "NaoAutenticadoError";
  }
}

export class SemPermissaoError extends Error {
  constructor(permission: Permission) {
    super(`Seu perfil não tem permissão para esta operação (${permission}).`);
    this.name = "SemPermissaoError";
  }
}

async function dadosDaRequisicao(): Promise<{
  ip: string | null;
  userAgent: string | null;
}> {
  const h = await headers();
  // x-forwarded-for pode trazer vários IPs encadeados; o primeiro é o cliente.
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  return { ip, userAgent: h.get("user-agent") };
}

/** Sessão atual, ou `null` quando não há usuário autenticado. */
export async function getContext(): Promise<ActionContext | null> {
  const session = await auth();
  if (!session?.user?.id || !session.user.role) return null;

  const { ip, userAgent } = await dadosDaRequisicao();

  return {
    userId: session.user.id,
    role: session.user.role,
    name: session.user.name ?? "",
    ip,
    userAgent,
  };
}

/** Sessão atual; lança quando não houver usuário autenticado. */
export async function requireContext(): Promise<ActionContext> {
  const ctx = await getContext();
  if (!ctx) throw new NaoAutenticadoError();
  return ctx;
}

/**
 * Autorização de verdade: acontece no servidor, em toda operação.
 * A interface esconde botões por conveniência; quem decide é esta função.
 */
export async function requirePermission(
  permission: Permission,
): Promise<ActionContext> {
  const ctx = await requireContext();
  if (!can(ctx.role, permission)) throw new SemPermissaoError(permission);
  return ctx;
}
