/**
 * Tipos e regras do preço de mercado compartilhados entre servidor e tela.
 * Fora do componente cliente porque a página (servidor) também decide se a
 * busca está em andamento.
 */

export interface ReferenciaDeMercado {
  valor: number | null;
  /** "USADO" | "NOVO" */
  tipo: string | null;
  /** PENDING | OK | NOT_FOUND | FAILED | null (nunca buscado) */
  status: string | null;
}

/** Pendência mais velha que isso foi abandonada pelo worker. */
const PENDENCIA_ABANDONADA_MS = 15 * 60 * 1000;

export function estaBuscando(
  status: string | null,
  desde: Date | string | null,
): boolean {
  if (status !== "PENDING") return false;
  if (!desde) return true;
  return Date.now() - new Date(desde).getTime() < PENDENCIA_ABANDONADA_MS;
}
