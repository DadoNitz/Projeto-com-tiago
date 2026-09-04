/**
 * Remove os dados de demonstração, preservando o catálogo.
 *
 * Rodar UMA vez, quando o sistema for começar a receber estoque real:
 *
 *   npm run limpar-demo -- --confirmar
 *
 * O que sai: produtos, unidades, movimentações, montagens, anúncios,
 * promoções e a trilha de auditoria referente a eles.
 *
 * O que fica: categorias e especificações (são o catálogo que faz o
 * formulário funcionar), marcas, locais, tags, sócios e usuários.
 *
 * Sem `--confirmar` o script só mostra o que apagaria. Apagar estoque é
 * irreversível, e um comando destrutivo que roda por engano é pior que um
 * comando chato.
 */
import { prisma } from "../prisma/seed/client";

const confirmado = process.argv.includes("--confirmar");

async function contar() {
  const [produtos, unidades, movimentos, montagens, anuncios, promocoes, trilha] =
    await Promise.all([
      prisma.product.count(),
      prisma.inventoryUnit.count(),
      prisma.inventoryMovement.count(),
      prisma.build.count(),
      prisma.listing.count(),
      prisma.promotion.count(),
      prisma.auditLog.count(),
    ]);

  return { produtos, unidades, movimentos, montagens, anuncios, promocoes, trilha };
}

async function main() {
  const antes = await contar();

  console.log("Dados atualmente no banco:");
  console.log(`  produtos           : ${antes.produtos}`);
  console.log(`  unidades           : ${antes.unidades}`);
  console.log(`  movimentações      : ${antes.movimentos}`);
  console.log(`  montagens          : ${antes.montagens}`);
  console.log(`  anúncios           : ${antes.anuncios}`);
  console.log(`  promoções          : ${antes.promocoes}`);
  console.log(`  eventos de auditoria: ${antes.trilha}`);

  const [catalogo, especificacoes, marcas, locais, socios, usuarios] =
    await Promise.all([
      prisma.category.count(),
      prisma.specDefinition.count(),
      prisma.brand.count(),
      prisma.location.count(),
      prisma.partner.count(),
      prisma.user.count(),
    ]);

  console.log("\nSerá preservado:");
  console.log(`  ${catalogo} categorias com ${especificacoes} especificações`);
  console.log(`  ${marcas} marcas, ${locais} locais, ${socios} sócios`);
  console.log(`  ${usuarios} usuários (as contas e senhas não são tocadas)`);

  if (!confirmado) {
    console.log(
      "\nNada foi apagado. Para executar de verdade:\n" +
        "  npm run limpar-demo -- --confirmar",
    );
    return;
  }

  console.log("\nApagando...");

  // Ordem inversa das dependências. SQL cru porque a extensão de soft delete
  // converte `delete` em marcação — e aqui a remoção precisa ser definitiva.
  const tabelas = [
    "listings",
    "build_items",
    "builds",
    "compatibility_overrides",
    "inventory_movements",
    "unit_images",
    "inventory_units",
    "product_images",
    "product_tags",
    "price_history",
    "promotions",
    "products",
    "ai_messages",
    "ai_conversations",
    "ai_analyses",
    "audit_logs",
  ];

  for (const tabela of tabelas) {
    const linhas = await prisma.$executeRawUnsafe(`DELETE FROM "${tabela}"`);
    console.log(`  ${tabela.padEnd(26)} ${linhas} linha(s)`);
  }

  // A sequência volta a contar do começo: com o estoque vazio, faz sentido a
  // primeira peça real ser EST-00001.
  await prisma.$executeRawUnsafe(
    `SELECT setval('estoque_codigo_interno_seq', 1, false)`,
  );

  const depois = await contar();
  console.log("\nPronto. Restaram:");
  console.log(`  produtos: ${depois.produtos} · unidades: ${depois.unidades}`);
  console.log("\nO catálogo continua no lugar. Pode começar a cadastrar.");
}

main()
  .catch((erro) => {
    console.error("\nFalhou:", erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
