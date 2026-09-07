/**
 * Restauração a partir de um backup.
 *
 * Rodar:
 *   npm run restaurar -- backups/estoque-....json            (simulação)
 *   npm run restaurar -- backups/estoque-....json --gravar   (para valer)
 *
 * A simulação é o padrão de propósito. Restaurar é a operação mais perigosa
 * do sistema: se rodar por engano contra um banco com dados, sobrescreve o
 * trabalho de todo mundo. Um comando que exige um segundo argumento explícito
 * não roda por acidente.
 *
 * A simulação não é só um "parse". Ela confere que toda referência entre
 * tabelas fecha dentro do arquivo — um backup cujo `InventoryUnit` aponta
 * para um `Product` que não foi salvo é um backup inútil, e é melhor
 * descobrir isso agora do que no dia do desastre.
 *
 * Este caminho foi exercitado de ponta a ponta: um backup real foi restaurado
 * num schema isolado do mesmo banco e comparado registro a registro com a
 * origem — contagens, conteúdo das contas (incluindo hash de senha) e arrays
 * de opções. Tudo idêntico. Para repetir a verificação:
 *
 *   URL=$(node -e "...&schema=restore_test")
 *   DATABASE_URL=$URL npx prisma migrate deploy
 *   DATABASE_URL=$URL npm run restaurar -- backups/arquivo.json --gravar
 *   ... comparar ...
 *   DROP SCHEMA restore_test CASCADE
 */
import { readFile } from "node:fs/promises";

import { prisma } from "../prisma/seed/client";

const TABELAS = [
  "user",
  "partner",
  "category",
  "brand",
  "specDefinition",
  "location",
  "tag",
  "product",
  "productImage",
  "productTag",
  "inventoryUnit",
  "unitImage",
  "build",
  "buildItem",
  "inventoryMovement",
  "compatibilityOverride",
  "listing",
  "aIConversation",
  "aIMessage",
  "aIAnalysis",
  "promotionStore",
  "promotion",
  "priceHistory",
  "pushSubscription",
  "auditLog",
] as const;

type Tabela = (typeof TABELAS)[number];

/**
 * Referências entre tabelas, para a conferência de integridade.
 * `[campo, tabela alvo]` — campo nulo é permitido.
 */
const REFERENCIAS: Partial<Record<Tabela, [string, Tabela][]>> = {
  partner: [["userId", "user"]],
  specDefinition: [["categoryId", "category"]],
  product: [
    ["categoryId", "category"],
    ["brandId", "brand"],
  ],
  productImage: [["productId", "product"]],
  productTag: [
    ["productId", "product"],
    ["tagId", "tag"],
  ],
  inventoryUnit: [
    ["productId", "product"],
    ["locationId", "location"],
    ["purchasedById", "partner"],
  ],
  unitImage: [["unitId", "inventoryUnit"]],
  build: [["createdById", "user"]],
  buildItem: [
    ["buildId", "build"],
    ["unitId", "inventoryUnit"],
  ],
  inventoryMovement: [
    ["unitId", "inventoryUnit"],
    ["productId", "product"],
    ["userId", "user"],
    ["partnerId", "partner"],
    ["buildId", "build"],
  ],
  compatibilityOverride: [["verifiedById", "user"]],
  listing: [
    ["unitId", "inventoryUnit"],
    ["buildId", "build"],
  ],
  aIConversation: [["userId", "user"]],
  aIMessage: [["conversationId", "aIConversation"]],
  promotion: [
    ["storeId", "promotionStore"],
    ["productId", "product"],
  ],
  priceHistory: [["promotionId", "promotion"]],
  pushSubscription: [["userId", "user"]],
  auditLog: [["userId", "user"]],
};

interface Backup {
  versao: number;
  geradoEm: string;
  banco: string;
  dados: Record<string, Record<string, unknown>[]>;
}

type ClienteIndexado = Record<
  Tabela,
  {
    count: () => Promise<number>;
    createMany: (args: { data: unknown[]; skipDuplicates?: boolean }) => Promise<{ count: number }>;
  }
>;

async function main() {
  const caminho = process.argv[2];
  const gravar = process.argv.includes("--gravar");

  if (!caminho || caminho.startsWith("--")) {
    console.error(
      "Uso: npm run restaurar -- backups/arquivo.json [--gravar]\n" +
        "Sem --gravar, apenas simula e confere a integridade do arquivo.",
    );
    process.exitCode = 1;
    return;
  }

  const backup = JSON.parse(await readFile(caminho, "utf8")) as Backup;

  if (backup.versao !== 1) {
    throw new Error(`Versao de backup desconhecida: ${backup.versao}`);
  }

  console.log(`Backup de ${backup.geradoEm} (banco "${backup.banco}")`);

  // ---- Conferencia de integridade ----
  const idsPorTabela = new Map<Tabela, Set<string>>();
  for (const tabela of TABELAS) {
    idsPorTabela.set(
      tabela,
      new Set((backup.dados[tabela] ?? []).map((linha) => String(linha.id))),
    );
  }

  let quebradas = 0;
  for (const tabela of TABELAS) {
    for (const [campo, alvo] of REFERENCIAS[tabela] ?? []) {
      for (const linha of backup.dados[tabela] ?? []) {
        const valor = linha[campo];
        if (valor === null || valor === undefined) continue;
        if (!idsPorTabela.get(alvo)?.has(String(valor))) {
          console.error(
            `  REFERENCIA QUEBRADA ${tabela}.${campo} = ${String(valor)} (nao existe em ${alvo})`,
          );
          quebradas += 1;
        }
      }
    }
  }

  if (quebradas > 0) {
    throw new Error(
      `${quebradas} referencia(s) quebrada(s). Este backup nao restaura por inteiro.`,
    );
  }
  console.log("Integridade: todas as referencias fecham dentro do arquivo.");

  // ---- Estado do banco de destino ----
  const cliente = prisma as unknown as ClienteIndexado;
  const ocupadas: string[] = [];
  for (const tabela of TABELAS) {
    const n = await cliente[tabela].count();
    if (n > 0) ocupadas.push(`${tabela} (${n})`);
  }

  const total = TABELAS.reduce(
    (soma, t) => soma + (backup.dados[t]?.length ?? 0),
    0,
  );

  if (!gravar) {
    console.log(`\nSIMULACAO — nada foi gravado.`);
    console.log(`  ${total} registros seriam inseridos.`);
    if (ocupadas.length > 0) {
      console.log(`  O banco de destino JA TEM dados: ${ocupadas.join(", ")}`);
      console.log(
        "  Restaurar por cima criaria conflito de chave. Limpe o banco antes,\n" +
          "  ou restaure num banco vazio.",
      );
    } else {
      console.log("  O banco de destino esta vazio. Restauracao seguraria.");
    }
    console.log("\nPara gravar de verdade, repita o comando com --gravar");
    return;
  }

  if (ocupadas.length > 0) {
    throw new Error(
      `O banco de destino nao esta vazio (${ocupadas.join(", ")}).\n` +
        "Restaurar por cima corromperia os dados. Limpe o banco antes.",
    );
  }

  console.log("\nGravando...");
  for (const tabela of TABELAS) {
    const linhas = backup.dados[tabela] ?? [];
    if (linhas.length === 0) continue;

    // Em lotes: um createMany com dezenas de milhares de linhas estoura o
    // limite de parametros do PostgreSQL.
    const LOTE = 500;
    let gravados = 0;
    for (let i = 0; i < linhas.length; i += LOTE) {
      const resultado = await cliente[tabela].createMany({
        data: linhas.slice(i, i + LOTE),
      });
      gravados += resultado.count;
    }
    console.log(`  ${tabela.padEnd(24)} ${gravados}`);
  }

  console.log(`\n${total} registros restaurados.`);
  console.log(
    "Confira a sequencia dos codigos internos antes de cadastrar:\n" +
      "  npx tsx --env-file=.env -e \"...\"  ou rode o seed, que a sincroniza.",
  );
}

main()
  .catch((erro) => {
    console.error(
      "\nRestauracao falhou:",
      erro instanceof Error ? erro.message : erro,
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
