import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/client";
import {
  ConflitoError,
  EstoqueInvalidoError,
  RegraDeNegocioError,
} from "@/server/services/errors";
import { registrarMovimento } from "@/server/services/movement.service";
import { cadastrarPecaComUnidades } from "@/server/services/product.service";
import {
  atualizarProduto,
  atualizarUnidade,
  excluirUnidade,
} from "@/server/services/unit-write.service";
import type { ActionContext } from "@/server/session";

/**
 * Edição de peça já cadastrada.
 *
 * O que se verifica aqui são os limites da edição — o que ela NÃO pode fazer
 * é mais importante que o que ela faz. Editar o campo de local direto, ou
 * apagar uma peça com histórico, corromperia a explicação do estoque.
 */

const MARCADOR = "__teste_edicao__";

let ctx: ActionContext;
let categoryId: string;
let locationId: string;

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

  categoryId = (
    await prisma.category.findFirstOrThrow({
      where: { slug: "ram" },
      select: { id: true },
    })
  ).id;

  locationId = (
    await prisma.location.findFirstOrThrow({ select: { id: true } })
  ).id;
});

afterAll(async () => {
  const produtos = await prisma.product.findMany({
    where: { name: { startsWith: MARCADOR } },
    select: { id: true },
  });
  const ids = produtos.map((p) => p.id);
  if (ids.length === 0) return;

  // A limpeza usa SQL cru: a extensao de soft delete bloqueia `delete` de
  // proposito, e aqui queremos remocao definitiva para nao deixar lixo no
  // estoque real. Isso tambem alcanca a unidade que um dos testes excluiu
  // logicamente e que as consultas normais ja nao enxergam.

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

async function criarPeca(quantidade = 1) {
  return cadastrarPecaComUnidades(
    {
      name: `${MARCADOR} memória ${Date.now()}-${Math.random()}`,
      categoryId,
      trackingMode: "SERIALIZED",
      lowStockThreshold: 0,
      tagIds: [],
      specs: { memoryType: "DDR4", capacityGb: 8 },
    },
    {
      quantidade,
      seriais: [],
      condition: "USED",
      locationId,
      purchaseCost: 100,
    },
    ctx,
  );
}

describe("edição da unidade", () => {
  it("altera serial, estado e valores", async () => {
    const { unitIds } = await criarPeca();
    const unitId = unitIds[0]!;

    await atualizarUnidade(
      unitId,
      {
        serialNumber: "KF3200A-9988",
        condition: "LIKE_NEW",
        purchaseCost: 150,
        estimatedSalePrice: 220,
        origin: "Troca com cliente",
      },
      ctx,
    );

    const unidade = await prisma.inventoryUnit.findUniqueOrThrow({
      where: { id: unitId },
      select: {
        serialNumber: true,
        serialLast: true,
        condition: true,
        purchaseCost: true,
        origin: true,
      },
    });

    expect(unidade.serialNumber).toBe("KF3200A-9988");
    expect(unidade.condition).toBe("LIKE_NEW");
    expect(Number(unidade.purchaseCost)).toBe(150);
    expect(unidade.origin).toBe("Troca com cliente");
  });

  it("recalcula o final do serial ao trocar o número", async () => {
    // Se o serialLast não acompanhasse, a busca pelos últimos dígitos passaria
    // a devolver a peça errada — e ninguém perceberia até procurar na
    // prateleira.
    const { unitIds } = await criarPeca();
    const unitId = unitIds[0]!;

    await atualizarUnidade(
      unitId,
      { serialNumber: "ABC-1234-7788", condition: "USED" },
      ctx,
    );

    const unidade = await prisma.inventoryUnit.findUniqueOrThrow({
      where: { id: unitId },
      select: { serialLast: true },
    });
    expect(unidade.serialLast?.endsWith("7788")).toBe(true);
  });

  it("recusa mudar o local pela edição", async () => {
    // Trocar o campo direto deixaria a peça "aparecendo" em outro lugar sem
    // registro de quem a moveu.
    const { unitIds } = await criarPeca();
    const outroLocal = await prisma.location.findFirst({
      where: { id: { not: locationId } },
      select: { id: true },
    });

    if (!outroLocal) return;

    await expect(
      atualizarUnidade(
        unitIds[0]!,
        { condition: "USED", locationId: outroLocal.id },
        ctx,
      ),
    ).rejects.toBeInstanceOf(RegraDeNegocioError);
  });

  it("não edita peça descartada", async () => {
    const { unitIds } = await criarPeca();
    await registrarMovimento({ unitId: unitIds[0]!, type: "DISCARD" }, ctx);

    await expect(
      atualizarUnidade(unitIds[0]!, { condition: "USED" }, ctx),
    ).rejects.toBeInstanceOf(EstoqueInvalidoError);
  });
});

describe("edição do produto", () => {
  it("altera a ficha técnica de todas as unidades do modelo", async () => {
    const { productId, unitIds } = await criarPeca(3);

    const resultado = await atualizarProduto(
      productId,
      {
        name: `${MARCADOR} memória renomeada`,
        lowStockThreshold: 4,
        specs: { memoryType: "DDR4", capacityGb: 16, speedMhz: 3200 },
      },
      ctx,
    );

    expect(resultado.unidadesAfetadas).toBe(3);

    // A ficha técnica mora no produto: as três unidades passam a ver o valor
    // novo sem nenhuma escrita nelas.
    const unidade = await prisma.inventoryUnit.findUniqueOrThrow({
      where: { id: unitIds[0]! },
      select: { product: { select: { specs: true, lowStockThreshold: true } } },
    });

    const specs = unidade.product.specs as Record<string, unknown>;
    expect(specs.capacityGb).toBe(16);
    expect(specs.speedMhz).toBe(3200);
    expect(unidade.product.lowStockThreshold).toBe(4);
  });

  it("recusa spec fora do vocabulário, como no cadastro", async () => {
    // Editar não pode ser um caminho para inserir o que o cadastro recusaria.
    const { productId } = await criarPeca();

    await expect(
      atualizarProduto(
        productId,
        {
          name: `${MARCADOR} invalida`,
          lowStockThreshold: 0,
          specs: { memoryType: "DDR9" },
        },
        ctx,
      ),
    ).rejects.toBeInstanceOf(RegraDeNegocioError);
  });
});

describe("exclusão lógica", () => {
  it("exclui peça disponível e sem histórico além da entrada", async () => {
    const { unitIds } = await criarPeca();
    await excluirUnidade(unitIds[0]!, "cadastro duplicado", ctx);

    // A extensão de soft delete faz a unidade sumir das consultas normais.
    const encontrada = await prisma.inventoryUnit.findUnique({
      where: { id: unitIds[0]! },
    });
    expect(encontrada).toBeNull();
  });

  it("recusa excluir peça que já foi movimentada", async () => {
    // Peça com histórico faz parte do passado da operação: escondê-la
    // distorceria relatórios de período já emitidos.
    const { unitIds } = await criarPeca();
    await registrarMovimento({ unitId: unitIds[0]!, type: "RESERVE" }, ctx);
    await registrarMovimento({ unitId: unitIds[0]!, type: "UNRESERVE" }, ctx);

    await expect(
      excluirUnidade(unitIds[0]!, undefined, ctx),
    ).rejects.toBeInstanceOf(ConflitoError);
  });

  it("recusa excluir peça reservada", async () => {
    const { unitIds } = await criarPeca();
    await registrarMovimento({ unitId: unitIds[0]!, type: "RESERVE" }, ctx);

    await expect(
      excluirUnidade(unitIds[0]!, undefined, ctx),
    ).rejects.toBeInstanceOf(EstoqueInvalidoError);
  });
});
