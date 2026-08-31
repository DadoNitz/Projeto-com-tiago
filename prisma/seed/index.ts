import { hash } from "bcryptjs";

import { CATALOGO_PADRAO } from "../../src/domain/specs/default-catalog";
import { construirSchemaDeSpecs } from "../../src/domain/specs/validation";
import { derivarSerialFinal } from "../../src/domain/inventory/serial";
import {
  proximoCodigoInterno,
  sincronizarSequenciaDeCodigos,
} from "../../src/server/db/internal-code";
import type { Prisma } from "../../src/generated/prisma/client";

import { prisma } from "./client";
import { LOCAIS, MARCAS, PRODUTOS, SOCIOS, TAGS } from "./produtos";

/**
 * Seed do sistema.
 *
 * Idempotente: pode rodar quantas vezes for preciso sem duplicar nada. Isso
 * importa porque o seed também é o instalador — é ele que grava o catálogo de
 * categorias e especificações, sem o qual não existe formulário de cadastro.
 *
 * As specs dos produtos de demonstração passam pela mesma validação que a
 * aplicação usa. Se um dado do seed divergir do catálogo, o seed falha aqui,
 * e não meses depois com uma regra de compatibilidade retornando errado.
 */

function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    // Remove os acentos separados pelo NFD: "Genérica" vira "generica".
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function semearCatalogo() {
  console.log("Catálogo de categorias e especificações...");

  for (const categoria of CATALOGO_PADRAO) {
    const registro = await prisma.category.upsert({
      where: { slug: categoria.slug },
      create: {
        slug: categoria.slug,
        name: categoria.name,
        description: categoria.description ?? null,
        icon: categoria.icon ?? null,
        sortOrder: categoria.sortOrder ?? 0,
      },
      update: {
        name: categoria.name,
        icon: categoria.icon ?? null,
        sortOrder: categoria.sortOrder ?? 0,
      },
    });

    for (const [indice, spec] of categoria.specs.entries()) {
      await prisma.specDefinition.upsert({
        where: {
          categoryId_key: { categoryId: registro.id, key: spec.key },
        },
        create: {
          categoryId: registro.id,
          key: spec.key,
          label: spec.label,
          type: spec.type,
          unit: spec.unit ?? null,
          required: spec.required ?? false,
          options: [...(spec.options ?? [])],
          usedInCompatibility: spec.usedInCompatibility ?? false,
          helpText: spec.helpText ?? null,
          sortOrder: spec.sortOrder ?? indice,
        },
        update: {
          label: spec.label,
          type: spec.type,
          unit: spec.unit ?? null,
          required: spec.required ?? false,
          options: [...(spec.options ?? [])],
          usedInCompatibility: spec.usedInCompatibility ?? false,
          helpText: spec.helpText ?? null,
          sortOrder: spec.sortOrder ?? indice,
        },
      });
    }
  }

  const total = CATALOGO_PADRAO.reduce((soma, c) => soma + c.specs.length, 0);
  console.log(`  ${CATALOGO_PADRAO.length} categorias, ${total} especificações.`);
}

async function semearUsuarios() {
  console.log("Usuários...");

  const emailAdmin = process.env.SEED_ADMIN_EMAIL?.toLowerCase().trim();
  const senhaAdmin = process.env.SEED_ADMIN_PASSWORD;

  if (!emailAdmin || !senhaAdmin) {
    throw new Error(
      "Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD no .env antes de rodar o seed.",
    );
  }

  if (senhaAdmin.length < 8) {
    throw new Error("SEED_ADMIN_PASSWORD precisa de pelo menos 8 caracteres.");
  }

  const usuarios = [
    { email: emailAdmin, name: "Administrador", role: "ADMIN" as const, senha: senhaAdmin },
    { email: "funcionario@local", name: "Funcionário de teste", role: "EMPLOYEE" as const, senha: "funcionario123" },
    { email: "consulta@local", name: "Consulta de teste", role: "VIEWER" as const, senha: "consulta123" },
  ];

  for (const usuario of usuarios) {
    const passwordHash = await hash(usuario.senha, 10);
    await prisma.user.upsert({
      where: { email: usuario.email },
      create: {
        email: usuario.email,
        name: usuario.name,
        role: usuario.role,
        passwordHash,
      },
      // A senha só é redefinida na criação: rodar o seed de novo não deve
      // sobrescrever uma senha que o usuário já trocou.
      update: { name: usuario.name, role: usuario.role },
    });
  }

  console.log(`  ${usuarios.length} usuários (admin: ${emailAdmin}).`);
  return emailAdmin;
}

async function semearSocios(adminId: string) {
  console.log("Sócios...");

  const idsPorSlug = new Map<string, string>();

  for (const socio of SOCIOS) {
    const registro = await prisma.partner.upsert({
      where: { slug: socio.slug },
      create: {
        slug: socio.slug,
        name: socio.nome,
        // Só o sócio que também opera o sistema tem conta vinculada.
        userId: socio.usuario === "ADMIN" ? adminId : null,
      },
      update: { name: socio.nome },
    });
    idsPorSlug.set(socio.slug, registro.id);
  }

  console.log(`  ${SOCIOS.length} sócios (${SOCIOS.map((s) => s.nome).join(", ")}).`);
  return idsPorSlug;
}

async function semearApoio() {
  console.log("Marcas, locais e tags...");

  for (const marca of MARCAS) {
    await prisma.brand.upsert({
      where: { slug: slugify(marca) },
      create: { slug: slugify(marca), name: marca },
      update: { name: marca },
    });
  }

  const idsPorNome = new Map<string, string>();
  for (const local of LOCAIS) {
    const parentId = local.pai ? (idsPorNome.get(local.pai) ?? null) : null;
    const existente = await prisma.location.findFirst({
      where: { code: local.code },
    });

    const registro = existente
      ? await prisma.location.update({
          where: { id: existente.id },
          data: { name: local.nome, parentId },
        })
      : await prisma.location.create({
          data: { name: local.nome, code: local.code, parentId },
        });

    idsPorNome.set(local.nome, registro.id);
  }

  for (const tag of TAGS) {
    await prisma.tag.upsert({
      where: { slug: tag.slug },
      create: { slug: tag.slug, name: tag.nome, color: tag.cor },
      update: { name: tag.nome, color: tag.cor },
    });
  }

  console.log(
    `  ${MARCAS.length} marcas, ${LOCAIS.length} locais, ${TAGS.length} tags.`,
  );
  return idsPorNome;
}

async function semearProdutos(
  locaisPorNome: Map<string, string>,
  sociosPorSlug: Map<string, string>,
  adminId: string,
) {
  // Sócios em ordem estável, para distribuir as peças sem comprador definido.
  const rodizio = [...sociosPorSlug.values()];
  let proximoSocio = 0;
  console.log("Produtos e unidades de estoque...");

  let produtosCriados = 0;
  let unidadesCriadas = 0;

  for (const produto of PRODUTOS) {
    const categoria = CATALOGO_PADRAO.find(
      (c) => c.slug === produto.slugCategoria,
    );
    if (!categoria) {
      throw new Error(
        `Produto "${produto.name}" referencia categoria inexistente: ${produto.slugCategoria}`,
      );
    }

    // Mesma validação da aplicação. Dado de seed que não passa aqui viraria
    // um produto quebrado no banco real.
    const validado = construirSchemaDeSpecs(categoria.specs).safeParse(
      produto.specs,
    );
    if (!validado.success) {
      const detalhes = validado.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new Error(`Specs inválidas em "${produto.name}" — ${detalhes}`);
    }

    const categoriaDb = await prisma.category.findUniqueOrThrow({
      where: { slug: produto.slugCategoria },
      select: { id: true },
    });
    const marcaDb = await prisma.brand.findUniqueOrThrow({
      where: { slug: slugify(produto.marca) },
      select: { id: true },
    });

    const existente = await prisma.product.findFirst({
      where: { name: produto.name, brandId: marcaDb.id },
      select: { id: true },
    });

    const dados = {
      name: produto.name,
      model: produto.model ?? null,
      partNumber: produto.partNumber ?? null,
      categoryId: categoriaDb.id,
      brandId: marcaDb.id,
      trackingMode: produto.trackingMode ?? "SERIALIZED",
      specs: validado.data as Prisma.InputJsonValue,
      defaultSalePrice: produto.defaultSalePrice ?? null,
      lowStockThreshold: produto.lowStockThreshold ?? 0,
    };

    const registroProduto = existente
      ? await prisma.product.update({ where: { id: existente.id }, data: dados })
      : await prisma.product.create({ data: dados });

    if (!existente) produtosCriados += 1;

    for (const slugTag of produto.tags ?? []) {
      const tag = await prisma.tag.findUnique({ where: { slug: slugTag } });
      if (!tag) continue;
      await prisma.productTag.upsert({
        where: {
          productId_tagId: { productId: registroProduto.id, tagId: tag.id },
        },
        create: { productId: registroProduto.id, tagId: tag.id },
        update: {},
      });
    }

    for (const unidade of produto.unidades) {
      // Serial é a chave natural da unidade física. Para itens por
      // quantidade, que não têm serial, usamos produto + local.
      const jaExiste = unidade.serial
        ? await prisma.inventoryUnit.findFirst({
            where: { serialNumber: unidade.serial },
            select: { id: true },
          })
        : await prisma.inventoryUnit.findFirst({
            where: { productId: registroProduto.id, serialNumber: null },
            select: { id: true },
          });

      if (jaExiste) continue;

      const locationId = locaisPorNome.get(unidade.local) ?? null;
      // Codigo vem da sequencia do Postgres, a mesma usada pela aplicacao.
      const codigoInterno = await proximoCodigoInterno(prisma);

      // Comprador explícito quando informado; senão, rodízio entre os sócios.
      // São dados de demonstração: o objetivo é que o extrato por sócio tenha
      // o que mostrar.
      const purchasedById = unidade.comprador
        ? (sociosPorSlug.get(unidade.comprador) ?? null)
        : (rodizio[proximoSocio++ % rodizio.length] ?? null);

      const status = unidade.status ?? "AVAILABLE";

      const registroUnidade = await prisma.inventoryUnit.create({
        data: {
          productId: registroProduto.id,
          internalCode: codigoInterno,
          serialNumber: unidade.serial ?? null,
          serialLast: derivarSerialFinal(unidade.serial),
          condition: unidade.condition,
          status,
          locationId,
          quantity: unidade.quantidade ?? 1,
          purchaseCost: unidade.custo ?? null,
          estimatedSalePrice: unidade.venda ?? produto.defaultSalePrice ?? null,
          origin: unidade.origem ?? null,
          notes: unidade.observacoes ?? null,
          purchasedById,
        },
      });

      // Toda unidade nasce com histórico. Peça que aparece no estoque sem
      // registro de entrada é exatamente o que a seção 10 quer evitar.
      await prisma.inventoryMovement.create({
        data: {
          unitId: registroUnidade.id,
          productId: registroProduto.id,
          type: "INBOUND",
          quantity: unidade.quantidade ?? 1,
          fromStatus: null,
          toStatus: "AVAILABLE",
          toLocationId: locationId,
          userId: adminId,
          partnerId: purchasedById,
          // Valor total desembolsado neste lançamento. É o que alimenta o
          // extrato "quanto cada sócio já gastou".
          amount:
            unidade.custo != null
              ? unidade.custo * (unidade.quantidade ?? 1)
              : null,
          reason: "Carga inicial (seed)",
        },
      });

      // Unidades que já nascem reservadas ou com defeito registram também a
      // movimentação que as levou a esse estado.
      if (status !== "AVAILABLE") {
        await prisma.inventoryMovement.create({
          data: {
            unitId: registroUnidade.id,
            productId: registroProduto.id,
            type: status === "RESERVED" ? "RESERVE" : "DEFECT",
            quantity: unidade.quantidade ?? 1,
            fromStatus: "AVAILABLE",
            toStatus: status,
            fromLocationId: locationId,
            toLocationId: locationId,
            userId: adminId,
            reason: unidade.observacoes ?? "Carga inicial (seed)",
          },
        });
      }

      unidadesCriadas += 1;
    }
  }

  console.log(
    `  ${produtosCriados} produtos novos, ${unidadesCriadas} unidades novas.`,
  );
}

async function main() {
  console.log("Semeando o banco...\n");

  await semearCatalogo();
  const emailAdmin = await semearUsuarios();
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: emailAdmin },
    select: { id: true },
  });
  const socios = await semearSocios(admin.id);
  const locais = await semearApoio();
  await semearProdutos(locais, socios, admin.id);

  // Garante que a sequencia esteja a frente de qualquer codigo ja existente,
  // inclusive de dados importados por fora do sistema.
  await sincronizarSequenciaDeCodigos(prisma);

  const [produtos, unidades, disponiveis] = await Promise.all([
    prisma.product.count({ where: { deletedAt: null } }),
    prisma.inventoryUnit.count({ where: { deletedAt: null } }),
    prisma.inventoryUnit.aggregate({
      where: { deletedAt: null, status: "AVAILABLE" },
      _sum: { quantity: true },
    }),
  ]);

  console.log("\nPronto.");
  console.log(`  produtos cadastrados : ${produtos}`);
  console.log(`  unidades físicas     : ${unidades}`);
  console.log(`  itens disponíveis    : ${disponiveis._sum.quantity ?? 0}`);
  console.log("\nExtrato por sócio: npm run extrato");
}

main()
  .catch((erro) => {
    console.error("\nO seed falhou:", erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
