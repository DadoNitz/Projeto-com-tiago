"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SpecDefinition, SpecValue } from "@/domain/specs/types";
import { cn } from "@/lib/utils";

/**
 * Campo de especificação gerado a partir do catálogo.
 *
 * O formulário não conhece nenhuma spec de hardware: ele lê a `SpecDefinition`
 * e desenha o controle certo. É isto que faz "criar categoria nova" ser
 * cadastro, e não programação.
 *
 * Specs de vocabulário controlado viram lista de escolha, nunca texto livre —
 * é o que impede "AM4", "am4" e "Socket AM4" de virarem três valores e quebrar
 * a regra de compatibilidade em silêncio.
 */
export function SpecField({
  definicao,
  valor,
  aoMudar,
  erro,
}: {
  definicao: SpecDefinition;
  valor: SpecValue | undefined;
  aoMudar: (valor: SpecValue | undefined) => void;
  erro?: string;
}) {
  const id = `spec-${definicao.key}`;
  const rotulo = definicao.unit
    ? `${definicao.label} (${definicao.unit})`
    : definicao.label;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-baseline gap-1.5">
        {rotulo}
        {definicao.required ? (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        ) : null}
        {definicao.usedInCompatibility ? (
          <span
            className="text-muted-foreground text-[10px]"
            title="Usada pelas regras de compatibilidade ao montar computadores"
          >
            compatibilidade
          </span>
        ) : null}
      </Label>

      {definicao.type === "BOOLEAN" ? (
        <label className="flex h-11 items-center gap-2 text-sm">
          <input
            id={id}
            type="checkbox"
            className="size-4"
            checked={valor === true}
            onChange={(evento) => aoMudar(evento.target.checked)}
          />
          Sim
        </label>
      ) : definicao.type === "ENUM" ? (
        <select
          id={id}
          className="border-input bg-background h-11 w-full rounded-md border px-3 text-sm"
          value={typeof valor === "string" ? valor : ""}
          onChange={(evento) => aoMudar(evento.target.value || undefined)}
        >
          <option value="">Não informado</option>
          {definicao.options?.map((opcao) => (
            <option key={opcao} value={opcao}>
              {opcao}
            </option>
          ))}
        </select>
      ) : definicao.type === "MULTI_ENUM" ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={id}>
          {definicao.options?.map((opcao) => {
            const selecionados = Array.isArray(valor) ? valor : [];
            const ativo = selecionados.includes(opcao);
            return (
              <button
                key={opcao}
                type="button"
                aria-pressed={ativo}
                onClick={() =>
                  aoMudar(
                    ativo
                      ? selecionados.filter((item) => item !== opcao)
                      : [...selecionados, opcao],
                  )
                }
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors",
                  ativo
                    ? "bg-primary text-primary-foreground border-primary"
                    : "hover:bg-muted",
                )}
              >
                {opcao}
              </button>
            );
          })}
        </div>
      ) : (
        <Input
          id={id}
          className="h-11"
          type={definicao.type === "NUMBER" ? "number" : "text"}
          inputMode={definicao.type === "NUMBER" ? "decimal" : undefined}
          step="any"
          min={definicao.min}
          max={definicao.max}
          value={
            typeof valor === "string" || typeof valor === "number"
              ? String(valor)
              : ""
          }
          onChange={(evento) => aoMudar(evento.target.value || undefined)}
          aria-invalid={Boolean(erro)}
        />
      )}

      {definicao.helpText ? (
        <p className="text-muted-foreground text-xs">{definicao.helpText}</p>
      ) : null}
      {erro ? <p className="text-destructive text-xs">{erro}</p> : null}
    </div>
  );
}
