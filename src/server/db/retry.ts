import { Prisma } from "@/generated/prisma/client";

/**
 * Nova tentativa automática quando o banco está hibernando.
 *
 * O Neon suspende o compute depois de alguns minutos sem uso (é o que torna o
 * plano gratuito viável). A primeira consulta depois disso falha com P1001
 * enquanto o servidor acorda, e a seguinte funciona.
 *
 * Sem isto, o primeiro login do dia falharia com "não foi possível concluir a
 * operação" — e a pessoa concluiria, com razão, que o sistema está quebrado.
 *
 * Por que é seguro repetir inclusive escritas: P1001 significa que a conexão
 * não foi estabelecida, ou seja, a consulta nunca chegou ao banco. Não há
 * efeito parcial para duplicar. Erros que acontecem *depois* de conectar
 * (violação de constraint, transação abortada) não entram aqui.
 */

/** Códigos que indicam servidor inalcançável, não erro de dados. */
const CODIGOS_TRANSITORIOS = new Set(["P1001", "P1002", "P1017"]);

const TENTATIVAS = 3;
const ESPERA_BASE_MS = 400;

function ehTransitorio(erro: unknown): boolean {
  if (erro instanceof Prisma.PrismaClientKnownRequestError) {
    return CODIGOS_TRANSITORIOS.has(erro.code);
  }
  if (erro instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }
  // O driver adapter às vezes propaga o erro de socket sem embrulhar.
  if (erro instanceof Error) {
    return /DatabaseNotReachable|ECONNRESET|ETIMEDOUT|ENOTFOUND|Connection terminated/i.test(
      erro.message,
    );
  }
  return false;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const retryExtension = Prisma.defineExtension({
  name: "retry-cold-start",
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        let ultimoErro: unknown;

        for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa += 1) {
          try {
            return await query(args);
          } catch (erro) {
            if (!ehTransitorio(erro) || tentativa === TENTATIVAS) throw erro;

            ultimoErro = erro;
            // Espera crescente: 400ms, 800ms. Tempo suficiente para o compute
            // do Neon subir, sem travar a requisição por muito tempo.
            await esperar(ESPERA_BASE_MS * tentativa);
          }
        }

        throw ultimoErro;
      },
    },
  },
});
