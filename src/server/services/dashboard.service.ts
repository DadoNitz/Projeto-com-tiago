import "server-only";

import { prisma } from "@/server/db/client";

/**
 * Indicadores do dashboard (seção 4).
 *
 * Todos calculados por agregação no banco. Somar valor de estoque trazendo
 * milhares de linhas para a aplicação seria lento e, pior, daria resultado
 * diferente conforme a paginação.
 */

export interface ResumoDoEstoque {
  produtos: number;
  unidades: number;
  disponiveis: number;
  reservados: number;
  comDefeito: number;
  emMontagem: number;
  valorEstimado: number;
  custoTotal: number;
}

/**
 * `quantity` é somado em vez de contar linhas: itens por quantidade têm uma
 * linha só com saldo N, e contar linhas diria "1 cabo" onde há 38.
 */
export async function resumoDoEstoque(): Promise<ResumoDoEstoque> {
  const [produtos, unidades, porStatus, valores] = await Promise.all([
    prisma.product.count(),
    prisma.inventoryUnit.aggregate({ _sum: { quantity: true } }),
    prisma.inventoryUnit.groupBy({
      by: ["status"],
      _sum: { quantity: true },
    }),
    // Valor parado no estoque considera apenas o que ainda pode ser vendido.
    // Incluir vendidos e descartados inflaria o número e o tornaria inútil
    // para responder "onde está meu dinheiro parado?".
    prisma.inventoryUnit.aggregate({
      where: { status: { in: ["AVAILABLE", "RESERVED", "IN_BUILD"] } },
      _sum: { estimatedSalePrice: true, purchaseCost: true },
    }),
  ]);

  const somaDe = (status: string) =>
    porStatus.find((linha) => linha.status === status)?._sum.quantity ?? 0;

  return {
    produtos,
    unidades: unidades._sum.quantity ?? 0,
    disponiveis: somaDe("AVAILABLE"),
    reservados: somaDe("RESERVED"),
    comDefeito: somaDe("DEFECTIVE"),
    emMontagem: somaDe("IN_BUILD"),
    valorEstimado: Number(valores._sum.estimatedSalePrice ?? 0),
    custoTotal: Number(valores._sum.purchaseCost ?? 0),
  };
}

export interface CategoriaComTotais {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  unidades: number;
  disponiveis: number;
  valor: number;
}

/** Quantidade e valor por categoria, para o gráfico e a navegação. */
export async function totaisPorCategoria(): Promise<CategoriaComTotais[]> {
  const categorias = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, slug: true, name: true, icon: true },
  });

  const unidades = await prisma.inventoryUnit.findMany({
    select: {
      quantity: true,
      status: true,
      estimatedSalePrice: true,
      product: { select: { categoryId: true } },
    },
  });

  const totais = new Map<string, { unidades: number; disponiveis: number; valor: number }>();

  for (const unidade of unidades) {
    const chave = unidade.product.categoryId;
    const atual = totais.get(chave) ?? { unidades: 0, disponiveis: 0, valor: 0 };

    atual.unidades += unidade.quantity;
    if (unidade.status === "AVAILABLE") {
      atual.disponiveis += unidade.quantity;
      atual.valor += Number(unidade.estimatedSalePrice ?? 0) * unidade.quantity;
    }

    totais.set(chave, atual);
  }

  return categorias
    .map((categoria) => ({
      ...categoria,
      ...(totais.get(categoria.id) ?? { unidades: 0, disponiveis: 0, valor: 0 }),
    }))
    .filter((categoria) => categoria.unidades > 0)
    .sort((a, b) => b.unidades - a.unidades);
}

/** Últimas peças que entraram no estoque. */
export async function ultimasEntradas(limite = 8) {
  return prisma.inventoryUnit.findMany({
    orderBy: { createdAt: "desc" },
    take: limite,
    select: {
      id: true,
      internalCode: true,
      condition: true,
      status: true,
      entryDate: true,
      product: {
        select: {
          name: true,
          brand: { select: { name: true } },
          category: { select: { name: true, icon: true } },
        },
      },
    },
  });
}

export interface AlertaEstoqueBaixo {
  productId: string;
  nome: string;
  categoria: string;
  disponiveis: number;
  minimo: number;
}

/**
 * Produtos abaixo do mínimo configurado.
 *
 * Só considera produtos com `lowStockThreshold > 0`: um mínimo de zero
 * significa "não me avise sobre este item", e alertar sobre tudo o que zerou
 * tornaria a lista ruído.
 */
export async function alertasDeEstoqueBaixo(
  limite = 10,
): Promise<AlertaEstoqueBaixo[]> {
  const produtos = await prisma.product.findMany({
    where: { lowStockThreshold: { gt: 0 } },
    select: {
      id: true,
      name: true,
      lowStockThreshold: true,
      category: { select: { name: true } },
      units: {
        where: { status: "AVAILABLE" },
        select: { quantity: true },
      },
    },
  });

  return produtos
    .map((produto) => ({
      productId: produto.id,
      nome: produto.name,
      categoria: produto.category.name,
      disponiveis: produto.units.reduce((soma, u) => soma + u.quantity, 0),
      minimo: produto.lowStockThreshold,
    }))
    .filter((item) => item.disponiveis < item.minimo)
    .sort((a, b) => a.disponiveis - b.disponiveis)
    .slice(0, limite);
}

/**
 * Peças que precisam de atenção humana: com defeito ou em teste.
 *
 * A seção 4 pede "alertas importantes". Estes são os acionáveis hoje; os
 * alertas de montagem e de gargalo chegam com as Fases 2 e 3.
 */
export async function itensQuePrecisamDeAtencao(limite = 10) {
  return prisma.inventoryUnit.findMany({
    where: {
      OR: [{ status: "DEFECTIVE" }, { condition: "FOR_TESTING" }],
    },
    orderBy: { updatedAt: "desc" },
    take: limite,
    select: {
      id: true,
      internalCode: true,
      status: true,
      condition: true,
      notes: true,
      product: { select: { name: true } },
      location: { select: { name: true } },
    },
  });
}

/** Movimentações por dia, para o gráfico de atividade recente. */
export async function movimentacoesPorDia(dias = 14) {
  const desde = new Date();
  desde.setHours(0, 0, 0, 0);
  desde.setDate(desde.getDate() - (dias - 1));

  const movimentos = await prisma.inventoryMovement.findMany({
    where: { createdAt: { gte: desde } },
    select: { createdAt: true, type: true },
  });

  // Preenche todos os dias, inclusive os sem movimento: um gráfico com dias
  // faltando distorce a leitura da tendência.
  const porDia = new Map<string, { entradas: number; saidas: number }>();
  for (let i = 0; i < dias; i += 1) {
    const data = new Date(desde);
    data.setDate(desde.getDate() + i);
    porDia.set(data.toISOString().slice(0, 10), { entradas: 0, saidas: 0 });
  }

  const tiposDeSaida = new Set(["OUTBOUND", "SALE", "DISCARD", "DEFECT"]);

  for (const movimento of movimentos) {
    const chave = movimento.createdAt.toISOString().slice(0, 10);
    const registro = porDia.get(chave);
    if (!registro) continue;

    if (tiposDeSaida.has(movimento.type)) registro.saidas += 1;
    else registro.entradas += 1;
  }

  return [...porDia.entries()].map(([dia, valores]) => ({ dia, ...valores }));
}
