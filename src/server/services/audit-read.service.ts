import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/client";

/**
 * Leitura da trilha de auditoria (seção 17).
 *
 * A gravação já existia; faltava o outro lado. Uma trilha que ninguém
 * consegue consultar não responde "quem alterou isso e quando" — que é a
 * única razão de ela existir.
 *
 * A trilha é somente leitura por construção: não há função de editar nem de
 * apagar registro aqui, e nenhuma outra parte do sistema escreve nela fora do
 * `audit.service`.
 */

export interface FiltroDaTrilha {
  entity?: string | undefined;
  entityId?: string | undefined;
  userId?: string | undefined;
  action?: string | undefined;
  cursor?: string | undefined;
  limite?: number;
}

const SELECAO = {
  id: true,
  action: true,
  entity: true,
  entityId: true,
  before: true,
  after: true,
  ip: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
} satisfies Prisma.AuditLogSelect;

export type EventoDaTrilha = Prisma.AuditLogGetPayload<{
  select: typeof SELECAO;
}>;

export async function listarTrilha(filtro: FiltroDaTrilha = {}): Promise<{
  eventos: EventoDaTrilha[];
  proximoCursor: string | null;
}> {
  const limite = Math.min(filtro.limite ?? 40, 100);

  const where: Prisma.AuditLogWhereInput = {};
  if (filtro.entity) where.entity = filtro.entity;
  if (filtro.entityId) where.entityId = filtro.entityId;
  if (filtro.userId) where.userId = filtro.userId;
  if (filtro.action) where.action = filtro.action;

  const linhas = await prisma.auditLog.findMany({
    where,
    select: SELECAO,
    // `id` como desempate: sem ele, eventos gravados no mesmo instante — o que
    // acontece dentro de uma transação — poderiam repetir ou sumir entre
    // páginas.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limite + 1,
    ...(filtro.cursor ? { cursor: { id: filtro.cursor }, skip: 1 } : {}),
  });

  const temMais = linhas.length > limite;
  const eventos = temMais ? linhas.slice(0, limite) : linhas;

  return {
    eventos,
    proximoCursor: temMais ? (eventos.at(-1)?.id ?? null) : null,
  };
}

/** Entidades e ações presentes na trilha, para montar os filtros. */
export async function opcoesDaTrilha(): Promise<{
  entidades: string[];
  acoes: string[];
  usuarios: { id: string; name: string }[];
}> {
  const [entidades, acoes, usuarios] = await Promise.all([
    prisma.auditLog.findMany({
      distinct: ["entity"],
      select: { entity: true },
      orderBy: { entity: "asc" },
    }),
    prisma.auditLog.findMany({
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
    }),
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return {
    entidades: entidades.map((linha) => linha.entity),
    acoes: acoes.map((linha) => linha.action),
    usuarios,
  };
}

export interface CampoAlterado {
  campo: string;
  de: string;
  para: string;
}

/**
 * Compara o antes e o depois e devolve só o que mudou.
 *
 * Mostrar os dois JSON inteiros lado a lado obrigaria a pessoa a caçar a
 * diferença no meio de vinte campos iguais — e é justamente a diferença que
 * ela veio ver.
 */
export function camposAlterados(
  antes: unknown,
  depois: unknown,
): CampoAlterado[] {
  const de = (antes ?? {}) as Record<string, unknown>;
  const para = (depois ?? {}) as Record<string, unknown>;

  if (typeof de !== "object" || typeof para !== "object") return [];

  const chaves = new Set([...Object.keys(de), ...Object.keys(para)]);
  const mudancas: CampoAlterado[] = [];

  for (const chave of chaves) {
    const anterior = formatar(de[chave]);
    const novo = formatar(para[chave]);
    if (anterior === novo) continue;
    mudancas.push({ campo: chave, de: anterior, para: novo });
  }

  return mudancas.sort((a, b) => a.campo.localeCompare(b.campo));
}

function formatar(valor: unknown): string {
  if (valor === null || valor === undefined) return "—";
  if (typeof valor === "boolean") return valor ? "sim" : "não";
  if (Array.isArray(valor)) return valor.length === 0 ? "—" : valor.join(", ");
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
}
