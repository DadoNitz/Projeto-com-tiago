import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";

import { lerSchema, normalizarUrlPostgres } from "./connection-url";
import { retryExtension } from "./retry";
import { softDeleteExtension } from "./soft-delete";

/**
 * Único ponto de acesso ao banco. Só serviços em `src/server/**` importam este
 * módulo — a regra é imposta pelo ESLint (ver eslint.config.mjs).
 */

function criarClient() {
  const { DATABASE_URL, NODE_ENV } = env();
  // A aplicacao usa a conexao pooled: e o certo para trafego normal.
  const url = normalizarUrlPostgres(DATABASE_URL);

  const adapter = new PrismaPg(
    { connectionString: url },
    { schema: lerSchema(url) },
  );

  return (
    new PrismaClient({
      adapter,
      log: NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    })
      // Ordem importa: o retry fica por fora, para reexecutar a consulta ja
      // com o filtro de exclusao logica aplicado.
      .$extends(softDeleteExtension)
      .$extends(retryExtension)
  );
}

type ExtendedPrismaClient = ReturnType<typeof criarClient>;

// Em desenvolvimento o Next recarrega os módulos a cada alteração; sem este
// cache global cada reload abriria um novo pool de conexões até esgotar o
// limite do Postgres.
const globalForPrisma = globalThis as unknown as {
  prisma?: ExtendedPrismaClient;
};

function obterClient(): ExtendedPrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = criarClient();
  }
  return globalForPrisma.prisma;
}

/**
 * Cliente exposto como proxy preguiçoso.
 *
 * O cliente só é construído na primeira consulta de verdade, e não quando o
 * módulo é importado. A diferença importa em dois momentos:
 *
 * - **build**: o Next importa as rotas para coletar configuração. Com criação
 *   ansiosa, isso exigia `DATABASE_URL` válida e abria um pool de conexões só
 *   para compilar — o build passava a depender do banco estar de pé.
 * - **testes**: importar um serviço para testar uma função pura não deve
 *   tentar conectar em lugar nenhum.
 */
export const prisma: ExtendedPrismaClient = new Proxy(
  {} as ExtendedPrismaClient,
  {
    get(_alvo, propriedade) {
      const client = obterClient();
      const valor = Reflect.get(client, propriedade) as unknown;
      // Métodos precisam manter o `this` do cliente real, não o do proxy.
      return typeof valor === "function" ? valor.bind(client) : valor;
    },
  },
);

export type { ExtendedPrismaClient };

/**
 * Cliente de transação. Serviços que participam de uma transação recebem este
 * tipo em vez do cliente global, de modo que seja impossível escrever fora da
 * transação por engano.
 */
export type PrismaTransaction = Parameters<
  Parameters<ExtendedPrismaClient["$transaction"]>[0]
>[0];
