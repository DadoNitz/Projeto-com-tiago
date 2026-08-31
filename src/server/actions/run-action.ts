import "server-only";

import { z } from "zod";

import type { Permission } from "@/lib/auth/permissions";
import {
  NaoAutenticadoError,
  SemPermissaoError,
  requirePermission,
  type ActionContext,
} from "@/server/session";
import { RegraDeNegocioError } from "@/server/services/errors";

/**
 * Resultado padronizado de toda Server Action.
 *
 * Um tipo de retorno em vez de exceções que atravessam a fronteira: exceções
 * do servidor chegam ao cliente com a mensagem apagada em produção, o que
 * transformaria "estoque insuficiente" em "algo deu errado".
 */
/** Erros por campo, no formato que os formulários consomem. */
export type FieldErrors = Record<string, string[] | undefined>;

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail<T>(
  error: string,
  fieldErrors?: FieldErrors,
): ActionResult<T> {
  return fieldErrors ? { ok: false, error, fieldErrors } : { ok: false, error };
}

interface RunActionOptions<TSchema extends z.ZodType, TOutput> {
  /** Permissão exigida. Verificada antes de qualquer outra coisa. */
  permission: Permission;
  /** Validação do input. Nada chega ao handler sem passar por aqui. */
  schema: TSchema;
  handler: (
    input: z.infer<TSchema>,
    ctx: ActionContext,
  ) => Promise<TOutput> | TOutput;
}

/**
 * Executa uma Server Action na ordem obrigatória: autorizar, validar, agir.
 *
 * Toda action do sistema passa por aqui (docs/01-ARQUITETURA.md). Concentrar
 * essas três etapas em um só lugar evita o modo de falha mais comum em
 * aplicações com Server Actions: uma action nova que esquece de verificar a
 * sessão e vira um endpoint público de escrita.
 */
export async function runAction<TSchema extends z.ZodType, TOutput>(
  options: RunActionOptions<TSchema, TOutput>,
  input: unknown,
): Promise<ActionResult<TOutput>> {
  try {
    const ctx = await requirePermission(options.permission);

    const parsed = options.schema.safeParse(input);
    if (!parsed.success) {
      const { fieldErrors } = z.flattenError(parsed.error);
      return fail("Verifique os campos destacados.", fieldErrors);
    }

    const data = await options.handler(parsed.data, ctx);
    return ok(data);
  } catch (erro) {
    return fail(mensagemDeErro(erro));
  }
}

function mensagemDeErro(erro: unknown): string {
  // Erros que o usuário precisa ler na íntegra: são sobre a operação dele,
  // não sobre o funcionamento interno do sistema.
  if (
    erro instanceof RegraDeNegocioError ||
    erro instanceof SemPermissaoError ||
    erro instanceof NaoAutenticadoError
  ) {
    return erro.message;
  }

  // Qualquer outra coisa é falha inesperada: registra no servidor e devolve
  // mensagem genérica, sem vazar detalhe de infraestrutura (seção 21).
  console.error("[action] erro inesperado:", erro);
  return "Não foi possível concluir a operação. Tente novamente.";
}
