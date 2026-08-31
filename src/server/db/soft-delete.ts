import { Prisma } from "@/generated/prisma/client";

/**
 * Modelos que usam exclusão lógica (seção 17 da especificação).
 * Manter esta lista em sincronia com os campos `deletedAt` do schema.
 */
export const SOFT_DELETE_MODELS = [
  "User",
  "Category",
  "Brand",
  "Product",
  "Location",
  "InventoryUnit",
  "Build",
  "AIConversation",
] as const;

export type SoftDeleteModel = (typeof SOFT_DELETE_MODELS)[number];

const SOFT_DELETE_SET = new Set<string>(SOFT_DELETE_MODELS);

/**
 * Desliga o filtro automático de exclusão lógica em uma consulta específica.
 *
 * Uso: `where: { ...INCLUIR_EXCLUIDOS, categoryId }`.
 *
 * A extensão só injeta `deletedAt: null` quando a chave `deletedAt` ainda não
 * está presente no `where`. Passá-la como `undefined` é, portanto, uma forma
 * explícita e pesquisável de dizer "aqui eu quero ver os excluídos também".
 */
export const INCLUIR_EXCLUIDOS = { deletedAt: undefined } as const;

/**
 * Lançado ao tentar `delete`/`deleteMany` em um modelo com exclusão lógica.
 * A mensagem aponta o caminho correto em vez de apenas recusar.
 */
export class ExclusaoPermanenteBloqueadaError extends Error {
  constructor(model: string, operation: string) {
    super(
      `Exclusão permanente bloqueada em ${model}.${operation}(). ` +
        `Este modelo usa exclusão lógica: atualize \`deletedAt\` ` +
        `(ex.: prisma.${model.charAt(0).toLowerCase()}${model.slice(1)}` +
        `.update({ where, data: { deletedAt: new Date() } })).`,
    );
    this.name = "ExclusaoPermanenteBloqueadaError";
  }
}

/** Lançado quando `findUniqueOrThrow` acha um registro logicamente excluído. */
export class RegistroExcluidoError extends Error {
  constructor(model: string) {
    super(`Registro de ${model} não encontrado (excluído).`);
    this.name = "RegistroExcluidoError";
  }
}

type ArgsComWhere = { where?: Record<string, unknown> };

function comFiltroPadrao<T>(args: T): T {
  const argsObj =
    typeof args === "object" && args !== null ? (args as ArgsComWhere) : {};

  // A chave presente (mesmo com valor undefined) significa escolha explícita.
  if (argsObj.where && "deletedAt" in argsObj.where) {
    return args;
  }

  return { ...argsObj, where: { ...argsObj.where, deletedAt: null } } as T;
}

function estaExcluido(resultado: unknown): boolean {
  return (
    typeof resultado === "object" &&
    resultado !== null &&
    "deletedAt" in resultado &&
    (resultado as { deletedAt: unknown }).deletedAt != null
  );
}

/**
 * Extensão que aplica exclusão lógica automaticamente.
 *
 * Motivação (docs/00-ANALISE-E-RISCOS.md §8): o filtro `deletedAt: null` não
 * pode depender de quem escreve a query. Uma única query esquecida mostraria
 * peças excluídas na listagem ou, pior, as somaria no valor do estoque.
 *
 * Comportamento:
 * - leituras em lote e `updateMany` -> injeta `deletedAt: null` no `where`;
 * - `findUnique`/`findUniqueOrThrow` -> o Prisma não aceita campo não-único no
 *   `where`, então o resultado é descartado depois da consulta;
 * - `delete`/`deleteMany` -> lançam erro. Uma extensão não consegue trocar a
 *   operação executada, então em vez de fingir que converteu, o caminho errado
 *   é fechado de forma barulhenta e com a instrução do caminho certo.
 */
export const softDeleteExtension = Prisma.defineExtension({
  name: "soft-delete",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!SOFT_DELETE_SET.has(model)) {
          return query(args);
        }

        switch (operation) {
          case "findMany":
          case "findFirst":
          case "findFirstOrThrow":
          case "count":
          case "aggregate":
          case "groupBy":
          case "updateMany":
            return query(comFiltroPadrao(args));

          case "findUnique": {
            const resultado = await query(args);
            return estaExcluido(resultado) ? null : resultado;
          }

          case "findUniqueOrThrow": {
            const resultado = await query(args);
            if (estaExcluido(resultado)) {
              throw new RegistroExcluidoError(model);
            }
            return resultado;
          }

          case "delete":
          case "deleteMany":
            throw new ExclusaoPermanenteBloqueadaError(model, operation);

          default:
            return query(args);
        }
      },
    },
  },
});
