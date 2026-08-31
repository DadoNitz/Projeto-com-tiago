/**
 * Extrato por socio: quanto cada um investiu e quanto ja retornou.
 *
 * Rodar: npx tsx scripts/extrato-socios.ts
 *
 * Le do historico de movimentacoes, que e append-only. O extrato e sempre
 * reconstituivel a partir dele, sem depender de campos mutaveis.
 */
import { prisma } from "../prisma/seed/client";

async function main() {
  const socios = await prisma.partner.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const investido = await prisma.inventoryMovement.groupBy({
    by: ["partnerId"],
    where: { type: "INBOUND" },
    _sum: { amount: true },
    _count: true,
  });

  const retornado = await prisma.inventoryMovement.groupBy({
    by: ["partnerId"],
    where: { type: "SALE" },
    _sum: { amount: true },
    _count: true,
  });

  const mapa = (linhas: typeof investido) =>
    new Map(linhas.map((l) => [l.partnerId ?? "", l]));

  const entradas = mapa(investido);
  const saidas = mapa(retornado);

  console.log("Socio          Investido     Retornado     Pecas");
  console.log("-".repeat(52));

  for (const socio of socios) {
    const e = entradas.get(socio.id);
    const s = saidas.get(socio.id);
    const inv = Number(e?._sum.amount ?? 0);
    const ret = Number(s?._sum.amount ?? 0);
    console.log(
      socio.name.padEnd(14) +
        ("R$ " + inv.toFixed(2)).padEnd(14) +
        ("R$ " + ret.toFixed(2)).padEnd(14) +
        String(e?._count ?? 0),
    );
  }

  const semComprador = await prisma.inventoryUnit.count({
    where: { purchasedById: null },
  });
  console.log("-".repeat(52));
  console.log("unidades sem comprador informado:", semComprador);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
