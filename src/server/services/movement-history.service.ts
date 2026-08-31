import "server-only";

import type { MovementType } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/client";

/**
 * Leitura do historico de movimentacao.
 *
 * Separado do MovementService de proposito: aquele so escreve, este so le.
 * A separacao deixa obvio, ao olhar os imports de um arquivo, se ele pode ou
 * nao alterar o estoque.
 */

const POR_PAGINA = 40;

export async function listarMovimentacoes(opcoes: {
  tipo?: MovementType | undefined;
  unitId?: string | undefined;
  cursor?: string | undefined;
  limite?: number | undefined;
}) {
  const limite = opcoes.limite ?? POR_PAGINA;

  const where = {
    ...(opcoes.tipo ? { type: opcoes.tipo } : {}),
    ...(opcoes.unitId ? { unitId: opcoes.unitId } : {}),
  };

  // Uma linha a mais para saber se existe proxima pagina sem segunda consulta.
  const linhas = await prisma.inventoryMovement.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limite + 1,
    ...(opcoes.cursor ? { cursor: { id: opcoes.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      type: true,
      quantity: true,
      amount: true,
      reason: true,
      createdAt: true,
      unitId: true,
      product: { select: { name: true } },
      user: { select: { name: true } },
      partner: { select: { name: true } },
      toLocation: { select: { name: true } },
    },
  });

  const temMais = linhas.length > limite;
  const itens = temMais ? linhas.slice(0, limite) : linhas;

  return {
    itens,
    proximoCursor: temMais ? (itens.at(-1)?.id ?? null) : null,
  };
}
