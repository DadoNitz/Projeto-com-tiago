import "server-only";

import {
  sugerirPreco,
  type PecaPrecificada,
  type SugestaoDePreco,
  type VendaAnterior,
} from "@/domain/pricing/preco-de-venda";
import { paraNumero } from "@/lib/format";
import { prisma } from "@/server/db/client";

import { NaoEncontradoError } from "./errors";

/**
 * Leitura dos dados que alimentam a sugestão de preço.
 *
 * A conta em si mora em `@/domain/pricing/preco-de-venda`, que é puro e
 * testado. Aqui só se busca no banco o que ela precisa: o que cada peça custou,
 * por quanto se pretende vendê-la, e o que as vendas anteriores ensinaram.
 */

/**
 * Quantas vendas anteriores entram no parâmetro.
 *
 * Vinte cobre bem mais que o mínimo exigido pela mediana sem alcançar preço de
 * um ano atrás, que em hardware descreve outro mercado.
 */
const JANELA_DE_VENDAS = 20;

/** Sugestão para um computador montado. */
export async function sugerirPrecoDeMontagem(
  buildId: string,
): Promise<SugestaoDePreco | null> {
  const build = await prisma.build.findUnique({
    where: { id: buildId },
    select: {
      id: true,
      items: {
        select: {
          unit: {
            select: { purchaseCost: true, estimatedSalePrice: true },
          },
        },
      },
    },
  });

  if (!build) throw new NaoEncontradoError("Montagem");

  const pecas: PecaPrecificada[] = build.items.map((item) => ({
    custo: paraNumero(item.unit.purchaseCost),
    precoEstimado: paraNumero(item.unit.estimatedSalePrice),
  }));

  return sugerirPreco(pecas, await vendasDeMontagens(buildId), {
    montada: true,
  });
}

/** Sugestão para uma peça avulsa. */
export async function sugerirPrecoDeUnidade(
  unitId: string,
): Promise<SugestaoDePreco | null> {
  const unidade = await prisma.inventoryUnit.findUnique({
    where: { id: unitId },
    select: { productId: true, purchaseCost: true, estimatedSalePrice: true },
  });

  if (!unidade) throw new NaoEncontradoError("Unidade de estoque");

  return sugerirPreco(
    [
      {
        custo: paraNumero(unidade.purchaseCost),
        precoEstimado: paraNumero(unidade.estimatedSalePrice),
      },
    ],
    await vendasDoProduto(unidade.productId, unitId),
  );
}

/**
 * Montagens já vendidas, com custo e preço.
 *
 * A própria montagem fica de fora: uma montagem que já foi vendida não deve
 * entrar como parâmetro do preço dela mesma.
 */
async function vendasDeMontagens(exceto: string): Promise<VendaAnterior[]> {
  const vendidas = await prisma.build.findMany({
    where: {
      id: { not: exceto },
      status: "SOLD",
      deletedAt: null,
      salePrice: { not: null },
      totalCost: { not: null },
    },
    orderBy: { updatedAt: "desc" },
    take: JANELA_DE_VENDAS,
    select: { totalCost: true, salePrice: true },
  });

  return vendidas
    .map((venda) => ({
      custo: paraNumero(venda.totalCost) ?? 0,
      preco: paraNumero(venda.salePrice) ?? 0,
    }))
    .filter((venda) => venda.custo > 0 && venda.preco > 0);
}

/**
 * Vendas anteriores da mesma peça.
 *
 * Do mesmo produto, e não de qualquer peça: a margem de uma placa de vídeo não
 * diz nada sobre a de um gabinete.
 */
async function vendasDoProduto(
  productId: string,
  exceto: string,
): Promise<VendaAnterior[]> {
  const vendidas = await prisma.inventoryUnit.findMany({
    where: {
      id: { not: exceto },
      productId,
      deletedAt: null,
      soldPrice: { not: null },
      purchaseCost: { not: null },
    },
    orderBy: { soldAt: "desc" },
    take: JANELA_DE_VENDAS,
    select: { purchaseCost: true, soldPrice: true },
  });

  return vendidas
    .map((venda) => ({
      custo: paraNumero(venda.purchaseCost) ?? 0,
      preco: paraNumero(venda.soldPrice) ?? 0,
    }))
    .filter((venda) => venda.custo > 0 && venda.preco > 0);
}
