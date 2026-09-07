import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma, type PrismaTransaction } from "@/server/db/client";
import type { Ator } from "@/server/ator";

/**
 * Trilha de auditoria (seção 17).
 *
 * Registrada pela aplicação, e não por trigger do banco, por um motivo
 * prático: o trigger sabe qual linha mudou, mas não sabe **quem** fez a
 * mudança — a conexão é sempre do mesmo usuário do Postgres. O `userId` da
 * aplicação só existe aqui.
 */

export type AcaoAuditada =
  | "create"
  | "update"
  | "delete"
  | "restore"
  | "movement"
  | "login";

interface RegistrarAuditoriaInput {
  action: AcaoAuditada;
  entity: string;
  entityId: string;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
}

/**
 * Grava um evento de auditoria.
 *
 * Recebe o cliente de transação quando faz parte de uma operação maior: o log
 * precisa nascer e morrer junto com a alteração que ele descreve. Auditoria
 * gravada fora da transação registraria eventos que não aconteceram, se a
 * transação falhasse depois.
 */
export async function registrarAuditoria(
  input: RegistrarAuditoriaInput,
  ctx: Ator,
  tx: PrismaTransaction | typeof prisma = prisma,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      userId: ctx.userId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      before: input.before ?? undefined,
      after: input.after ?? undefined,
      // Ação do sistema não tem IP nem navegador; guarda a origem no lugar,
      // para a trilha dizer o que disparou.
      ip: "ip" in ctx ? ctx.ip : null,
      userAgent: "userAgent" in ctx ? ctx.userAgent : ctx.origem,
    },
  });
}
