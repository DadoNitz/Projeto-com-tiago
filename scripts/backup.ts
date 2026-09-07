/**
 * Backup completo do banco.
 *
 * Rodar: npm run backup
 *
 * Existe porque a exportação em CSV da tela é outra coisa: ela serve para
 * abrir no Excel e cobre só o estoque. Um backup precisa levar tudo o que é
 * preciso para reconstruir o sistema — movimentações, sócios, montagens,
 * auditoria, contas.
 *
 * O plano gratuito do Neon tem janela curta de restauração. Se alguém apagar
 * algo errado e a falta só for notada semanas depois, o histórico do provedor
 * já passou. Este arquivo é a cópia que **você** controla.
 *
 * ATENÇÃO: o arquivo gerado contém hashes de senha e todos os dados do
 * negócio. Ele é gravado em `backups/`, que está fora do controle de versão.
 * Guarde-o como guardaria uma planilha financeira.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "../prisma/seed/client";

/**
 * Ordem das tabelas: dependências antes de quem depende delas.
 *
 * Não é decoração — a restauração insere nesta sequência, e inverter faria a
 * chave estrangeira falhar. Manter a lista aqui, e não gerá-la do schema,
 * é proposital: uma tabela nova precisa de uma decisão consciente sobre onde
 * ela entra na ordem.
 */
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

interface Backup {
  versao: 1;
  geradoEm: string;
  banco: string;
  dados: Record<string, unknown[]>;
  contagem: Record<string, number>;
}

/** O cliente Prisma indexado por nome de modelo, para percorrer a lista. */
type ClienteIndexado = Record<
  Tabela,
  { findMany: (args?: unknown) => Promise<unknown[]> }
>;

function nomeDoBanco(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? "").pathname.slice(1) || "?";
  } catch {
    return "?";
  }
}

async function main() {
  const verificarApenas = process.argv.includes("--verificar");
  const arquivoParaVerificar = process.argv[process.argv.indexOf("--verificar") + 1];

  if (verificarApenas && arquivoParaVerificar) {
    await verificar(arquivoParaVerificar);
    return;
  }

  const cliente = prisma as unknown as ClienteIndexado;
  const dados: Record<string, unknown[]> = {};
  const contagem: Record<string, number> = {};

  console.log("Lendo o banco...");

  for (const tabela of TABELAS) {
    // Sem filtro de exclusão lógica: um backup precisa levar inclusive o que
    // foi apagado logicamente, senão restaurar perderia registros que o
    // sistema ainda considera existentes para fins de histórico.
    const linhas = await cliente[tabela].findMany();
    dados[tabela] = linhas;
    contagem[tabela] = linhas.length;
    if (linhas.length > 0) {
      console.log(`  ${tabela.padEnd(24)} ${linhas.length}`);
    }
  }

  const backup: Backup = {
    versao: 1,
    geradoEm: new Date().toISOString(),
    banco: nomeDoBanco(),
    dados,
    contagem,
  };

  const pasta = path.join(process.cwd(), "backups");
  await mkdir(pasta, { recursive: true });

  const carimbo = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 16);
  const destino = path.join(pasta, `estoque-${carimbo}.json`);

  // `replacer` converte Decimal e Date para texto; sem isso o JSON perderia a
  // precisão dos valores monetários.
  await writeFile(
    destino,
    JSON.stringify(
      backup,
      (_chave, valor) =>
        typeof valor === "bigint" ? valor.toString() : (valor as unknown),
      2,
    ),
    "utf8",
  );

  const total = Object.values(contagem).reduce((soma, n) => soma + n, 0);
  console.log(`\n${total} registros salvos em ${path.relative(process.cwd(), destino)}`);

  // Backup que ninguém conferiu não é backup. A verificação relê o arquivo do
  // disco e compara com o banco.
  await verificar(destino);

  console.log(
    "\nGuarde este arquivo fora desta máquina. Ele contém hashes de senha e\n" +
      "todos os dados do negócio.",
  );
}

async function verificar(caminho: string) {
  console.log("\nConferindo o arquivo...");

  const bruto = await readFile(caminho, "utf8");
  const backup = JSON.parse(bruto) as Backup;

  if (backup.versao !== 1) {
    throw new Error(`Versão de backup desconhecida: ${backup.versao}`);
  }

  const cliente = prisma as unknown as ClienteIndexado;
  let divergencias = 0;

  for (const tabela of TABELAS) {
    const noArquivo = backup.dados[tabela]?.length ?? 0;
    const noBanco = (await cliente[tabela].findMany()).length;

    if (noArquivo !== noBanco) {
      console.error(
        `  DIVERGENCIA ${tabela}: ${noArquivo} no arquivo, ${noBanco} no banco`,
      );
      divergencias += 1;
    }
  }

  if (divergencias > 0) {
    throw new Error(
      `${divergencias} tabela(s) divergem. O backup NAO esta completo.`,
    );
  }

  console.log("  Todas as tabelas conferem com o banco.");
}

main()
  .catch((erro) => {
    console.error("\nBackup falhou:", erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
