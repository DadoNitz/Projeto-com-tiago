"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

const nadaParaAssinar = () => () => {};

/** O tema só é conhecido no cliente; até lá, renderiza o estado neutro. */
function useMontado() {
  return useSyncExternalStore(
    nadaParaAssinar,
    () => true,
    () => false,
  );
}

/** Botão redondo da barra superior: alterna entre claro e escuro. */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const montado = useMontado();

  const escuro = montado && resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(escuro ? "light" : "dark")}
      aria-label={escuro ? "Mudar para tema claro" : "Mudar para tema escuro"}
      className={cn(
        "bg-card text-foreground hover:bg-muted relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border transition-colors",
        className,
      )}
    >
      <Sun
        aria-hidden
        className={cn(
          "absolute size-5 transition-all duration-300 ease-[var(--ease-spring)]",
          escuro ? "scale-100 rotate-0 opacity-100" : "scale-50 -rotate-90 opacity-0",
        )}
      />
      <Moon
        aria-hidden
        className={cn(
          "absolute size-5 transition-all duration-300 ease-[var(--ease-spring)]",
          escuro ? "scale-50 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100",
        )}
      />
    </button>
  );
}

/** Seletor de três posições para a tela "Mais": claro, escuro ou do celular. */
export function ThemeSegmented() {
  const { theme, setTheme } = useTheme();
  const montado = useMontado();
  const atual = montado ? (theme ?? "system") : "system";

  const opcoes = [
    { valor: "light", rotulo: "Claro", Icone: Sun },
    { valor: "dark", rotulo: "Escuro", Icone: Moon },
    { valor: "system", rotulo: "Do celular", Icone: Monitor },
  ] as const;

  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className="bg-muted grid grid-cols-3 gap-1 rounded-2xl p-1"
    >
      {opcoes.map(({ valor, rotulo, Icone }) => {
        const ativo = atual === valor;
        return (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => setTheme(valor)}
            className={cn(
              "flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all duration-200",
              ativo
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icone className="size-4" aria-hidden />
            {rotulo}
          </button>
        );
      })}
    </div>
  );
}
