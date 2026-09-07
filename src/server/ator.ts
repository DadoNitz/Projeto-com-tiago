import type { Role } from "@/generated/prisma/enums";

/**
 * Quem executou uma ação.
 *
 * Mora num módulo separado de `session.ts` de propósito: `session.ts` importa
 * `next/headers` e o Auth.js, e quem só precisa saber *quem agiu* — a
 * auditoria, um serviço de fundo, um teste — não deveria arrastar meia
 * biblioteca de autenticação junto. `session.ts` reexporta tudo daqui, então
 * quem já importava de lá não muda nada.
 */

/**
 * Contexto de execução de uma operação de escrita feita por uma pessoa.
 *
 * Carrega quem está agindo e de onde — é o que alimenta a auditoria
 * (seção 17) e o campo `userId` das movimentações.
 */
export interface ActionContext {
  userId: string;
  role: Role;
  name: string;
  ip: string | null;
  userAgent: string | null;
}

/**
 * Contexto de uma ação executada pelo próprio sistema.
 *
 * Coleta automática de promoções roda por agendamento, sem ninguém logado.
 * Atribuir essas ações a um administrador qualquer seria mentir na trilha de
 * auditoria: o registro diria que uma pessoa fez o que a máquina fez, e a
 * trilha perderia justamente o valor que tem.
 *
 * `userId` nulo é representável no banco — a coluna já aceita nulo, porque o
 * autor pode ter sido removido. Aqui o nulo significa "não foi pessoa".
 */
export interface ContextoDoSistema {
  userId: null;
  /** De onde partiu: "telegram", "agendamento". Vai para `userAgent`. */
  origem: string;
}

/** Quem executou uma ação: uma pessoa logada, ou o próprio sistema. */
export type Ator = ActionContext | ContextoDoSistema;

export function contextoDoSistema(origem: string): ContextoDoSistema {
  return { userId: null, origem };
}
