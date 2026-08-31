import "server-only";

import { prisma } from "@/server/db/client";

/**
 * Relatórios tradicionais (seção 9).
 *
 * Todos calculados por agregação no banco. Trazer as linhas para somar na
 * aplicação daria resultado diferente conforme a paginação, e ficaria lento
 * exatamente quando o estoque crescesse a ponto de o relatório importar.
 */

export type Periodo =
  | "hoje"
  | "7dias"
  | "30dias"
  | "mes"
  | "ano"
  | "tudo";

export const ROTULO_PERIODO: Record<Periodo, string> = {
  hoje: "Hoje",
  "7dias": "Últimos 7 dias",
  "30dias": "Últimos 30 dias",
  mes: "Este mês",
  ano: "Este ano",
  tudo: "Desde o início",
};

/** Converte o período em uma data de corte. `null` significa sem corte. */
export function inicioDoPeriodo(periodo: Periodo): Date | null {
  const agora = new Date();

  switch (periodo) {
    case "hoje": {
      const data = new Date(agora);
      data.setHours(0, 0, 0, 0);
      return data;
    }
    case "7dias": {
      const data = new Date(agora);
      data.setDate(data.getDate() - 7);
      return data;
    }
    case "30dias": {
      const data = new Date(agora);
      data.setDate(data.getDate() - 30);
      return data;
    }
    case "mes":
      return new Date(agora.getFullYear(), agora.getMonth(), 1);
    case "ano":
      return new Date(agora.getFullYear(), 0, 1);
    case "tudo":
      return null;
  }
}

export interface LinhaDeRelatorio {
  rotulo: string;
  quantidade: number;
  valor: number;
}

export interface RelatorioDoEstoque {
  periodo: Periodo;
  porCategoria: LinhaDeRelatorio[];
  porMarca: LinhaDeRelatorio[];
  porSituacao: LinhaDeRelatorio[];
  entradas: { quantidade: number; valor: number };
  saidas: { quantidade: number; valor: number };
  vendas: { quantidade: number; valor: number };
  maisAntigas: {
    codigo: string;
    nome: string;
    diasParada: number;
    valor: number;
  }[];
  maiorGiro: { nome: string; movimentacoes: number }[];
  totalGeral: { unidades: number; investido: number; estimado: number };
}

export async function gerarRelatorio(
  periodo: Periodo,
): Promise<RelatorioDoEstoque> {
  const desde = inicioDoPeriodo(periodo);
  const filtroDePeriodo = desde ? { createdAt: { gte: desde } } : {};

  const [
    categorias,
    marcas,
    porStatus,
    movimentos,
    antigas,
    giro,
    totais,
  ] = await Promise.all([
    prisma.category.findMany({
      select: {
        name: true,
        products: {
          select: {
            units: {
              where: { status: "AVAILABLE" },
              select: { quantity: true, estimatedSalePrice: true },
            },
          },
        },
      },
    }),

    prisma.brand.findMany({
      select: {
        name: true,
        products: {
          select: {
            units: {
              where: { status: "AVAILABLE" },
              select: { quantity: true, estimatedSalePrice: true },
            },
          },
        },
      },
    }),

    prisma.inventoryUnit.groupBy({
      by: ["status"],
      _sum: { quantity: true, estimatedSalePrice: true },
    }),

    prisma.inventoryMovement.groupBy({
      by: ["type"],
      where: filtroDePeriodo,
      _sum: { quantity: true, amount: true },
    }),

    prisma.inventoryUnit.findMany({
      where: { status: "AVAILABLE" },
      orderBy: { entryDate: "asc" },
      take: 15,
      select: {
        internalCode: true,
        entryDate: true,
        estimatedSalePrice: true,
        product: { select: { name: true } },
      },
    }),

    prisma.inventoryMovement.groupBy({
      by: ["productId"],
      where: filtroDePeriodo,
      _count: { _all: true },
      orderBy: { _count: { productId: "desc" } },
      take: 10,
    }),

    prisma.inventoryUnit.aggregate({
      where: { status: { in: ["AVAILABLE", "RESERVED", "IN_BUILD"] } },
      _sum: {
        quantity: true,
        purchaseCost: true,
        estimatedSalePrice: true,
      },
    }),
  ]);

  const agregarPorGrupo = (
    grupos: {
      name: string;
      products: { units: { quantity: number; estimatedSalePrice: unknown }[] }[];
    }[],
  ): LinhaDeRelatorio[] =>
    grupos
      .map((grupo) => {
        const unidades = grupo.products.flatMap((produto) => produto.units);
        return {
          rotulo: grupo.name,
          quantidade: unidades.reduce((soma, u) => soma + u.quantity, 0),
          valor: unidades.reduce(
            (soma, u) => soma + Number(u.estimatedSalePrice ?? 0) * u.quantity,
            0,
          ),
        };
      })
      .filter((linha) => linha.quantidade > 0)
      .sort((a, b) => b.valor - a.valor);

  const somarTipos = (tipos: string[]) => {
    const linhas = movimentos.filter((linha) => tipos.includes(linha.type));
    return {
      quantidade: linhas.reduce((soma, l) => soma + (l._sum.quantity ?? 0), 0),
      valor: linhas.reduce((soma, l) => soma + Number(l._sum.amount ?? 0), 0),
    };
  };

  // Nomes dos produtos de maior giro, numa segunda consulta enxuta em vez de
  // um join pesado no groupBy.
  const nomesDeProdutos = await prisma.product.findMany({
    where: { id: { in: giro.map((linha) => linha.productId) } },
    select: { id: true, name: true },
  });
  const nomePorId = new Map(nomesDeProdutos.map((p) => [p.id, p.name]));

  const agora = Date.now();

  return {
    periodo,
    porCategoria: agregarPorGrupo(categorias),
    porMarca: agregarPorGrupo(marcas),
    porSituacao: porStatus
      .map((linha) => ({
        rotulo: linha.status,
        quantidade: linha._sum.quantity ?? 0,
        valor: Number(linha._sum.estimatedSalePrice ?? 0),
      }))
      .sort((a, b) => b.quantidade - a.quantidade),
    entradas: somarTipos(["INBOUND", "RETURN"]),
    saidas: somarTipos(["OUTBOUND", "SALE", "DISCARD"]),
    vendas: somarTipos(["SALE"]),
    maisAntigas: antigas.map((unidade) => ({
      codigo: unidade.internalCode,
      nome: unidade.product.name,
      diasParada: Math.floor(
        (agora - unidade.entryDate.getTime()) / 86_400_000,
      ),
      valor: Number(unidade.estimatedSalePrice ?? 0),
    })),
    maiorGiro: giro.map((linha) => ({
      nome: nomePorId.get(linha.productId) ?? "(removido)",
      movimentacoes: linha._count._all,
    })),
    totalGeral: {
      unidades: totais._sum.quantity ?? 0,
      investido: Number(totais._sum.purchaseCost ?? 0),
      estimado: Number(totais._sum.estimatedSalePrice ?? 0),
    },
  };
}

/**
 * Escapa um campo para CSV.
 *
 * Aspas duplicadas e envolvidas: sem isso, um nome de peça com vírgula
 * ("Fonte 650W, modular") quebraria a coluna e o arquivo inteiro sairia
 * desalinhado a partir dali.
 */
function campoCsv(valor: unknown): string {
  const texto = valor === null || valor === undefined ? "" : String(valor);
  return `"${texto.replace(/"/g, '""')}"`;
}

/** Exporta o estoque completo em CSV, pronto para abrir no Excel. */
export async function exportarEstoqueCsv(): Promise<string> {
  const unidades = await prisma.inventoryUnit.findMany({
    orderBy: { internalCode: "asc" },
    select: {
      internalCode: true,
      serialNumber: true,
      status: true,
      condition: true,
      quantity: true,
      purchaseCost: true,
      estimatedSalePrice: true,
      soldPrice: true,
      entryDate: true,
      origin: true,
      notes: true,
      location: { select: { name: true } },
      purchasedBy: { select: { name: true } },
      product: {
        select: {
          name: true,
          model: true,
          partNumber: true,
          brand: { select: { name: true } },
          category: { select: { name: true } },
        },
      },
    },
  });

  const cabecalho = [
    "Codigo interno",
    "Categoria",
    "Marca",
    "Produto",
    "Modelo",
    "Part Number",
    "Numero de serie",
    "Situacao",
    "Estado",
    "Quantidade",
    "Local",
    "Comprado por",
    "Custo",
    "Valor de venda",
    "Vendido por",
    "Data de entrada",
    "Origem",
    "Observacoes",
  ];

  const linhas = unidades.map((unidade) =>
    [
      unidade.internalCode,
      unidade.product.category.name,
      unidade.product.brand?.name ?? "",
      unidade.product.name,
      unidade.product.model ?? "",
      unidade.product.partNumber ?? "",
      unidade.serialNumber ?? "",
      unidade.status,
      unidade.condition,
      unidade.quantity,
      unidade.location?.name ?? "",
      unidade.purchasedBy?.name ?? "",
      // Vírgula decimal: é o que o Excel em português espera.
      Number(unidade.purchaseCost ?? 0).toFixed(2).replace(".", ","),
      Number(unidade.estimatedSalePrice ?? 0).toFixed(2).replace(".", ","),
      Number(unidade.soldPrice ?? 0).toFixed(2).replace(".", ","),
      unidade.entryDate.toISOString().slice(0, 10),
      unidade.origin ?? "",
      unidade.notes ?? "",
    ]
      .map(campoCsv)
      .join(";"),
  );

  // Ponto e vírgula como separador e BOM no início: sem os dois, o Excel em
  // português abre tudo numa coluna só e estraga os acentos.
  return `﻿${cabecalho.map(campoCsv).join(";")}\n${linhas.join("\n")}`;
}
