import path from "node:path";

import { defineConfig } from "prisma/config";

import { urlDeMigracao } from "./src/server/db/connection-url";

// O Prisma 7 nao carrega mais o .env automaticamente. O Next carrega o dele
// sozinho em runtime; aqui (CLI de migrations e seed) precisamos fazer a carga
// manualmente. process.loadEnvFile e nativo do Node 20.6+.
// Ordem importa: process.loadEnvFile NAO sobrescreve variavel ja definida,
// entao o primeiro arquivo vence. .env.local antes de .env reproduz a
// precedencia do Next.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(process.cwd(), file));
  } catch {
    // arquivo ausente e um caso normal (ex.: CI usando variaveis do ambiente)
  }
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed/index.ts",
  },
  datasource: {
    // Usado apenas pelos comandos de migration/introspection. Prefere a
    // conexao direta (nao-pooled): o pooler do Neon roda em transaction mode,
    // onde os advisory locks do Prisma Migrate nao sao confiaveis.
    // O PrismaClient em runtime usa a pooled, via src/server/db/client.ts.
    url: urlDeMigracao(),
  },
});
