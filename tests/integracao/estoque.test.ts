import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/client";
import { registrarMovimento } from "@/server/services/movement.service";
import {
  adicionarUnidades,
  cadastrarPecaComUnidades,
} from "@/server/services/product.service";
import { EstoqueInvalidoError } from "@/server/services/errors";
import type { ActionContext } from "@/server/session";

/**
 * Testes de integração das regras críticas de estoque (seção 29).
 *
 * Rodam contra o PostgreSQL de verdade, e não contra um mock, porque o que se
 * quer verificar é justamente o que só existe no banco: transações, o trigger
 * de quantidade, a sequência de códigos internos e o comportamento sob
 * concorrência. Um mock aqui testaria o mock.
 *
 * Tudo o que é criado leva um marcador no nome e é removido ao final.
 */

const MARCADOR = "__teste_integracao__";

let ctx: ActionContext;
let categoryId: string;
let locationId: string;
let partnerId: string;

beforeAll(async () => {
  const usuario = await prisma.user.findFirstOrThrow({
    where: { role: "ADMIN" },
    select: { id: true, name: true, role: true },
  });

  ctx = {
    userId: usuario.id,
    role: usuario.role,
    name: usuario.name,
    ip: null,
    userAgent: "vitest",
  };

  const categoria = await prisma.category.findFirstOrThrow({
    where: { slug: "gpu" },
    select: { id: true },
  });
  categoryId = categoria.id;

  const local = await prisma.location.findFirstOrThrow({ select: { id: true } });
  locationId = local.id;

  const socio = await prisma.partner.findFirstOrThrow({ select: { id: true } });
  partnerId = socio.id;
});

afterAll(async () => {
  // Limpeza na ordem inversa das dependências. Usa SQL cru porque a extensão
  // de soft delete bloqueia `delete` de propósito — e aqui queremos remoção
  // definitiva, para não deixar lixo no estoque real.
  const produtos = await prisma.product.findMany({
    where: { name: { startsWith: MARCADOR } },
    select: { id: true },
  });
  const ids = produtos.map((p) => p.id);
  if (ids.length === 0) return;

  await prisma.$executeRawUnsafe(
    `DELETE FROM "inventory_movements" WHERE "productId" = ANY($1::text[])`,
    ids,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "audit_logs" WHERE "entityId" = ANY($1::text[])`,
    ids,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "inventory_units" WHERE "productId" = ANY($1::text[])`,
    ids,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "products" WHERE id = ANY($1::text[])`,
    ids,
  );
});

async function criarPecaSerializada(quantidade: number, custo?: number) {
  return cadastrarPecaComUnidades(
    {
      name: `${MARCADOR} GPU ${Date.now()}-${Math.random()}`,
      categoryId,
      trackingMode: "SERIALIZED",
      lowStockThreshold: 0,
      tagIds: [],
      specs: {},
    },
    {
      quantidade,
      seriais: [],
      condition: "USED",
      locationId,
      purchasedById: partnerId,
      purchaseCost: custo,
    },
    ctx,
  );
}

describe("cadastro de peça", () => {
  it("cria uma unidade por peça, cada uma com código próprio", async () => {
    const resultado = await criarPecaSerializada(3);

    expect(resultado.unitIds).toHaveLength(3);
    expect(new Set(resultado.codigos).size).toBe(3);

    const unidades = await prisma.inventoryUnit.findMany({
      where: { productId: resultado.productId },
      select: { quantity: true, status: true },
    });
    expect(unidades).toHaveLength(3);
    // Item serializado sempre tem saldo 1: é a invariante que sustenta a
    // rastreabilidade individual.
    expect(unidades.every((u) => u.quantity === 1)).toBe(true);
    expect(unidades.every((u) => u.status === "AVAILABLE")).toBe(true);
  });

  it("registra a movimentação de entrada de cada unidade", async () => {
    const resultado = await criarPecaSerializada(2, 100);

    const movimentos = await prisma.inventoryMovement.findMany({
      where: { productId: resultado.productId },
      select: { type: true, toStatus: true, amount: true, partnerId: true },
    });

    // Peça que aparece no estoque sem registro de entrada é exatamente o que
    // a seção 10 proíbe.
    expect(movimentos).toHaveLength(2);
    expect(movimentos.every((m) => m.type === "INBOUND")).toBe(true);
    expect(movimentos.every((m) => m.toStatus === "AVAILABLE")).toBe(true);
    expect(movimentos.every((m) => m.partnerId === partnerId)).toBe(true);
    expect(movimentos.every((m) => Number(m.amount) === 100)).toBe(true);
  });

  it("item por quantidade vira uma linha só, com o saldo", async () => {
    const resultado = await cadastrarPecaComUnidades(
      {
        name: `${MARCADOR} cabo ${Date.now()}`,
        categoryId,
        trackingMode: "QUANTITY",
        lowStockThreshold: 0,
        tagIds: [],
        specs: {},
      },
      { quantidade: 25, seriais: [], condition: "NEW", locationId },
      ctx,
    );

    expect(resultado.unitIds).toHaveLength(1);
    const unidade = await prisma.inventoryUnit.findUniqueOrThrow({
      where: { id: resultado.unitIds[0]! },
      select: { quantity: true },
    });
    expect(unidade.quantity).toBe(25);
  });

  it("recusa especificação fora do vocabulário da categoria", async () => {
    await expect(
      cadastrarPecaComUnidades(
        {
          name: `${MARCADOR} invalida`,
          categoryId,
          trackingMode: "SERIALIZED",
          lowStockThreshold: 0,
          tagIds: [],
          specs: { powerConnectors: ["conector inventado"] },
        },
        { quantidade: 1, seriais: [], condition: "USED" },
        ctx,
      ),
    ).rejects.toThrow(/Especificações inválidas/);
  });
});

describe("movimentações", () => {
  it("reserva e libera uma unidade", async () => {
    const { unitIds } = await criarPecaSerializada(1);
    const unitId = unitIds[0]!;

    await registrarMovimento({ unitId, type: "RESERVE" }, ctx);
    let unidade = await prisma.inventoryUnit.findUniqueOrThrow({
      where: { id: unitId },
      select: { status: true },
    });
    expect(unidade.status).toBe("RESERVED");

    await registrarMovimento({ unitId, type: "UNRESERVE" }, ctx);
    unidade = await prisma.inventoryUnit.findUniqueOrThrow({
      where: { id: unitId },
      select: { status: true },
    });
    expect(unidade.status).toBe("AVAILABLE");
  });

  it("impede reservar duas vezes a mesma unidade", async () => {
    const { unitIds } = await criarPecaSerializada(1);
    const unitId = unitIds[0]!;

    await registrarMovimento({ unitId, type: "RESERVE" }, ctx);
    await expect(
      registrarMovimento({ unitId, type: "RESERVE" }, ctx),
    ).rejects.toBeInstanceOf(EstoqueInvalidoError);
  });

  it("sob concorrência, só uma reserva vence", async () => {
    // É o cenário que o compare-and-swap existe para resolver: duas pessoas
    // reservando a mesma peça no mesmo instante. Sem ele, as duas leriam
    // "AVAILABLE" e a peça seria prometida a dois clientes.
    const { unitIds } = await criarPecaSerializada(1);
    const unitId = unitIds[0]!;

    const resultados = await Promise.allSettled([
      registrarMovimento({ unitId, type: "RESERVE" }, ctx),
      registrarMovimento({ unitId, type: "RESERVE" }, ctx),
      registrarMovimento({ unitId, type: "RESERVE" }, ctx),
    ]);

    const sucessos = resultados.filter((r) => r.status === "fulfilled");
    expect(sucessos).toHaveLength(1);

    const movimentos = await prisma.inventoryMovement.count({
      where: { unitId, type: "RESERVE" },
    });
    // E o histórico não pode registrar reservas que não aconteceram.
    expect(movimentos).toBe(1);
  });

  it("não deixa vender uma unidade já vendida", async () => {
    const { unitIds } = await criarPecaSerializada(1);
    const unitId = unitIds[0]!;

    await registrarMovimento({ unitId, type: "SALE" }, ctx);
    await expect(
      registrarMovimento({ unitId, type: "SALE" }, ctx),
    ).rejects.toBeInstanceOf(EstoqueInvalidoError);
  });

  it("descarte é terminal: nada mais é aceito depois", async () => {
    const { unitIds } = await criarPecaSerializada(1);
    const unitId = unitIds[0]!;

    await registrarMovimento({ unitId, type: "DISCARD" }, ctx);
    await expect(
      registrarMovimento({ unitId, type: "RETURN" }, ctx),
    ).rejects.toBeInstanceOf(EstoqueInvalidoError);
  });

  it("recusa reserva de item controlado por quantidade", async () => {
    const resultado = await cadastrarPecaComUnidades(
      {
        name: `${MARCADOR} fungivel ${Date.now()}`,
        categoryId,
        trackingMode: "QUANTITY",
        lowStockThreshold: 0,
        tagIds: [],
        specs: {},
      },
      { quantidade: 10, seriais: [], condition: "NEW" },
      ctx,
    );

    await expect(
      registrarMovimento({ unitId: resultado.unitIds[0]!, type: "RESERVE" }, ctx),
    ).rejects.toBeInstanceOf(EstoqueInvalidoError);
  });

  it("saída maior que o saldo é recusada, sem deixar saldo negativo", async () => {
    const resultado = await cadastrarPecaComUnidades(
      {
        name: `${MARCADOR} saldo ${Date.now()}`,
        categoryId,
        trackingMode: "QUANTITY",
        lowStockThreshold: 0,
        tagIds: [],
        specs: {},
      },
      { quantidade: 5, seriais: [], condition: "NEW" },
      ctx,
    );
    const unitId = resultado.unitIds[0]!;

    await expect(
      registrarMovimento({ unitId, type: "OUTBOUND", quantity: 6 }, ctx),
    ).rejects.toBeInstanceOf(EstoqueInvalidoError);

    const unidade = await prisma.inventoryUnit.findUniqueOrThrow({
      where: { id: unitId },
      select: { quantity: true },
    });
    expect(unidade.quantity).toBe(5);
  });

  it("saída dentro do saldo reduz a quantidade", async () => {
    const resultado = await cadastrarPecaComUnidades(
      {
        name: `${MARCADOR} baixa ${Date.now()}`,
        categoryId,
        trackingMode: "QUANTITY",
        lowStockThreshold: 0,
        tagIds: [],
        specs: {},
      },
      { quantidade: 8, seriais: [], condition: "NEW" },
      ctx,
    );
    const unitId = resultado.unitIds[0]!;

    await registrarMovimento({ unitId, type: "OUTBOUND", quantity: 3 }, ctx);

    const unidade = await prisma.inventoryUnit.findUniqueOrThrow({
      where: { id: unitId },
      select: { quantity: true },
    });
    expect(unidade.quantity).toBe(5);
  });
});

describe("invariantes do banco", () => {
  it("o trigger impede saldo diferente de 1 em item serializado", async () => {
    const { unitIds } = await criarPecaSerializada(1);

    // Escrita crua, contornando o serviço de propósito: é exatamente o caso
    // que a invariante no banco existe para barrar.
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "inventory_units" SET quantity = 7 WHERE id = $1`,
        unitIds[0]!,
      ),
    ).rejects.toThrow();
  });

  it("o CHECK impede saldo negativo", async () => {
    const { unitIds } = await criarPecaSerializada(1);

    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "inventory_units" SET quantity = -1 WHERE id = $1`,
        unitIds[0]!,
      ),
    ).rejects.toThrow();
  });
});

describe("adicionar unidades a um produto existente", () => {
  it("reaproveita o modelo sem redigitar especificacao", async () => {
    // O caso da secao 23: "comprei mais tres dessas". A ficha tecnica mora no
    // produto, entao as novas unidades ja nascem com ela.
    const primeira = await criarPecaSerializada(1, 100);

    const produto = await prisma.product.findUniqueOrThrow({
      where: { id: primeira.productId },
      select: { specs: true },
    });

    const extras = await adicionarUnidades(
      primeira.productId,
      {
        quantidade: 3,
        seriais: ["EXTRA-1", "EXTRA-2"],
        condition: "NEW",
        purchaseCost: 120,
        purchasedById: partnerId,
      },
      ctx,
    );

    expect(extras.unitIds).toHaveLength(3);
    expect(extras.productId).toBe(primeira.productId);

    const unidades = await prisma.inventoryUnit.findMany({
      where: { productId: primeira.productId },
      select: {
        serialNumber: true,
        condition: true,
        product: { select: { specs: true } },
      },
    });

    expect(unidades).toHaveLength(4);
    // Todas veem a mesma ficha tecnica, sem nenhuma escrita de spec.
    for (const unidade of unidades) {
      expect(unidade.product.specs).toEqual(produto.specs);
    }

    // Os dois seriais informados foram usados; a terceira unidade ficou sem,
    // em vez de receber um numero inventado.
    const seriais = unidades.map((u) => u.serialNumber).filter(Boolean);
    expect(seriais).toContain("EXTRA-1");
    expect(seriais).toContain("EXTRA-2");
  });

  it("cada unidade nova recebe codigo interno unico e movimentacao de entrada", async () => {
    const base = await criarPecaSerializada(1);
    const extras = await adicionarUnidades(
      base.productId,
      { quantidade: 2, seriais: [], condition: "USED", purchaseCost: 50 },
      ctx,
    );

    expect(new Set(extras.codigos).size).toBe(2);

    const movimentos = await prisma.inventoryMovement.findMany({
      where: { unitId: { in: extras.unitIds } },
      select: { type: true, toStatus: true, amount: true },
    });

    expect(movimentos).toHaveLength(2);
    expect(movimentos.every((m) => m.type === "INBOUND")).toBe(true);
    expect(movimentos.every((m) => m.toStatus === "AVAILABLE")).toBe(true);
    expect(movimentos.every((m) => Number(m.amount) === 50)).toBe(true);
  });
});
