import "server-only";

import { prisma } from "@/server/db/client";

/**
 * Sócios e extrato financeiro.
 *
 * O extrato é calculado a partir do histórico de movimentação, que é
 * append-only. Nenhum saldo é guardado em campo: saldo desnormalizado sai do
 * ar na primeira correção manual e ninguém percebe até a conta não fechar.
 */

export interface ExtratoDoSocio {
  id: string;
  name: string;
  active: boolean;
  /** Total desembolsado em compras. */
  investido: number;
  /** Total recebido em vendas. */
  retornado: number;
  /** Peças compradas por esta pessoa que ainda estão no estoque. */
  pecasEmEstoque: number;
  /** Valor estimado de venda do que ainda está parado. */
  valorParado: number;
}

export async function listarSocios() {
  return prisma.partner.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, phone: true, active: true },
  });
}

export async function buscarSocio(id: string) {
  return prisma.partner.findUnique({
    where: { id },
    select: { id: true, name: true, active: true },
  });
}

/**
 * Extrato de todos os sócios.
 *
 * Três agregações separadas em vez de uma consulta gigante: cada uma responde
 * uma pergunta diferente ("quanto saiu", "quanto voltou", "quanto está
 * parado") e o Postgres resolve as três em paralelo.
 */
export async function extratoDosSocios(): Promise<ExtratoDoSocio[]> {
  const [socios, entradas, vendas, emEstoque] = await Promise.all([
    prisma.partner.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, active: true },
    }),
    prisma.inventoryMovement.groupBy({
      by: ["partnerId"],
      where: { type: "INBOUND", partnerId: { not: null } },
      _sum: { amount: true },
    }),
    prisma.inventoryMovement.groupBy({
      by: ["partnerId"],
      where: { type: "SALE", partnerId: { not: null } },
      _sum: { amount: true },
    }),
    prisma.inventoryUnit.groupBy({
      by: ["purchasedById"],
      where: {
        purchasedById: { not: null },
        status: { in: ["AVAILABLE", "RESERVED", "IN_BUILD"] },
      },
      _sum: { quantity: true, estimatedSalePrice: true },
    }),
  ]);

  const porId = <T extends { partnerId: string | null }>(linhas: T[]) =>
    new Map(linhas.map((linha) => [linha.partnerId ?? "", linha]));

  const mapaEntradas = porId(entradas);
  const mapaVendas = porId(vendas);
  const mapaEstoque = new Map(
    emEstoque.map((linha) => [linha.purchasedById ?? "", linha]),
  );

  return socios.map((socio) => ({
    id: socio.id,
    name: socio.name,
    active: socio.active,
    investido: Number(mapaEntradas.get(socio.id)?._sum.amount ?? 0),
    retornado: Number(mapaVendas.get(socio.id)?._sum.amount ?? 0),
    pecasEmEstoque: mapaEstoque.get(socio.id)?._sum.quantity ?? 0,
    valorParado: Number(
      mapaEstoque.get(socio.id)?._sum.estimatedSalePrice ?? 0,
    ),
  }));
}

/** Peças compradas por um sócio, para a visão detalhada. */
export async function pecasDoSocio(partnerId: string, limite = 50) {
  return prisma.inventoryUnit.findMany({
    where: { purchasedById: partnerId },
    orderBy: { entryDate: "desc" },
    take: limite,
    select: {
      id: true,
      internalCode: true,
      status: true,
      condition: true,
      purchaseCost: true,
      estimatedSalePrice: true,
      entryDate: true,
      product: {
        select: { name: true, category: { select: { icon: true } } },
      },
    },
  });
}
