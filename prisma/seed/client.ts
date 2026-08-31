import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../src/generated/prisma/client";
import { lerSchema, normalizarUrlPostgres } from "../../src/server/db/connection-url";

/**
 * Cliente Prisma do seed.
 *
 * Separado do cliente da aplicação por dois motivos:
 *
 * 1. `src/server/db/client.ts` importa `server-only`, que não carrega fora do
 *    Next;
 * 2. o seed precisa enxergar e limpar registros logicamente excluídos, o que a
 *    extensão de soft delete impede de propósito.
 */

// Ordem importa: process.loadEnvFile NAO sobrescreve variavel ja definida,
// entao o primeiro arquivo vence. .env.local antes de .env reproduz a
// precedencia do Next.
for (const arquivo of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(process.cwd(), arquivo));
  } catch {
    // ausente é normal
  }
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL não definida. Configure o .env antes de rodar o seed.",
  );
}

const url = normalizarUrlPostgres(databaseUrl);

const adapter = new PrismaPg(
  { connectionString: url },
  { schema: lerSchema(url) },
);

export const prisma = new PrismaClient({ adapter });
