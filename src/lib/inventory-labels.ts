import type {
  MovementType,
  UnitCondition,
  UnitStatus,
} from "@/generated/prisma/enums";

/**
 * Rótulos e cores dos estados do estoque.
 *
 * Módulo compartilhado entre servidor e cliente: os mesmos nomes precisam
 * aparecer na tabela, no filtro, no histórico e nas mensagens de erro.
 */

export const ROTULO_STATUS: Record<UnitStatus, string> = {
  AVAILABLE: "Disponível",
  RESERVED: "Reservada",
  IN_BUILD: "Em montagem",
  SOLD: "Vendida",
  DEFECTIVE: "Com defeito",
  DISCARDED: "Descartada",
  IN_TRANSIT: "Em trânsito",
};

/**
 * Cores por estado.
 *
 * Verde/âmbar/vermelho seguem a leitura óbvia, mas nunca sozinhos: cada
 * etiqueta também traz o texto. Cor como único portador de informação exclui
 * quem tem daltonismo — e a spec pede uma interface utilizável de verdade.
 */
export const COR_STATUS: Record<UnitStatus, string> = {
  AVAILABLE:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
  RESERVED:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  IN_BUILD:
    "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-900",
  SOLD: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  DEFECTIVE:
    "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900",
  DISCARDED:
    "bg-neutral-100 text-neutral-500 border-neutral-200 dark:bg-neutral-900 dark:text-neutral-400 dark:border-neutral-800",
  IN_TRANSIT:
    "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-900",
};

export const ROTULO_CONDICAO: Record<UnitCondition, string> = {
  NEW: "Novo",
  LIKE_NEW: "Seminovo",
  USED: "Usado",
  DEFECTIVE: "Com defeito",
  FOR_TESTING: "Para teste",
};

export const ROTULO_MOVIMENTO: Record<MovementType, string> = {
  INBOUND: "Entrada",
  OUTBOUND: "Saída",
  SALE: "Venda",
  RESERVE: "Reserva",
  UNRESERVE: "Reserva cancelada",
  RETURN: "Devolução",
  DEFECT: "Marcada com defeito",
  DISCARD: "Descarte",
  BUILD_ALLOCATE: "Usada em montagem",
  BUILD_RELEASE: "Liberada da montagem",
  TRANSFER: "Transferência",
  ADJUSTMENT: "Ajuste manual",
};

/** Movimentos que tiram a peça do estoque disponível, para colorir o histórico. */
export const MOVIMENTO_DE_SAIDA = new Set<MovementType>([
  "OUTBOUND",
  "SALE",
  "DISCARD",
  "DEFECT",
  "BUILD_ALLOCATE",
  "RESERVE",
]);

export const STATUS_SELECIONAVEIS: UnitStatus[] = [
  "AVAILABLE",
  "RESERVED",
  "IN_BUILD",
  "DEFECTIVE",
  "IN_TRANSIT",
  "SOLD",
  "DISCARDED",
];

export const CONDICOES_SELECIONAVEIS: UnitCondition[] = [
  "NEW",
  "LIKE_NEW",
  "USED",
  "DEFECTIVE",
  "FOR_TESTING",
];
