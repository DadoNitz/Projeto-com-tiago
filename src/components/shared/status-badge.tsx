import type { UnitCondition, UnitStatus } from "@/generated/prisma/enums";
import {
  COR_STATUS,
  ROTULO_CONDICAO,
  ROTULO_STATUS,
} from "@/lib/inventory-labels";
import { cn } from "@/lib/utils";

/**
 * Etiqueta de situação da unidade.
 *
 * Sempre com texto, nunca só cor: cor como único portador de informação
 * exclui quem tem daltonismo e some na impressão em preto e branco.
 */
export function StatusBadge({
  status,
  className,
}: {
  status: UnitStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        COR_STATUS[status],
        className,
      )}
    >
      {ROTULO_STATUS[status]}
    </span>
  );
}

/** Estado físico da peça. Visualmente mais discreto que a situação. */
export function ConditionBadge({
  condition,
  className,
}: {
  condition: UnitCondition;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-muted-foreground bg-muted inline-flex items-center rounded px-1.5 py-0.5 text-xs whitespace-nowrap",
        className,
      )}
    >
      {ROTULO_CONDICAO[condition]}
    </span>
  );
}
