"use client";

import { Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface UnidadeSelecionavel {
  id: string;
  codigo: string;
  nome: string;
  categoria: string;
}

/**
 * Seleção de peças para etiquetar.
 *
 * A seleção vive na URL, não no estado local: assim a lista de etiquetas
 * geradas sobrevive ao recarregar e à impressão, e o link pode ser reaberto
 * depois para reimprimir o mesmo lote.
 */
export function SeletorDeEtiquetas({
  unidades,
  selecionados,
}: {
  unidades: UnidadeSelecionavel[];
  selecionados: string[];
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState("");
  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set(selecionados),
  );

  const visiveis = useMemo(() => {
    const termo = filtro.trim().toLowerCase();
    if (!termo) return unidades.slice(0, 60);
    return unidades
      .filter(
        (unidade) =>
          unidade.nome.toLowerCase().includes(termo) ||
          unidade.codigo.toLowerCase().includes(termo),
      )
      .slice(0, 60);
  }, [filtro, unidades]);

  function alternar(id: string) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function gerar() {
    const params = new URLSearchParams();
    for (const id of marcados) params.append("unidade", id);
    router.push(`/estoque/etiquetas?${params.toString()}`);
  }

  return (
    <div className="bg-card space-y-3 rounded-lg border p-4 print:hidden">
      <Input
        value={filtro}
        onChange={(evento) => setFiltro(evento.target.value)}
        placeholder="Filtrar por nome ou código…"
        className="h-11"
      />

      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {visiveis.map((unidade) => {
          const marcado = marcados.has(unidade.id);
          return (
            <li key={unidade.id}>
              <button
                type="button"
                onClick={() => alternar(unidade.id)}
                aria-pressed={marcado}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md border p-2 text-left text-sm transition-colors",
                  marcado ? "border-primary bg-primary/5" : "hover:bg-muted",
                )}
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded border",
                    marcado && "bg-primary border-primary text-primary-foreground",
                  )}
                  aria-hidden
                >
                  {marcado ? "✓" : ""}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{unidade.nome}</span>
                  <span className="text-muted-foreground font-mono text-xs">
                    {unidade.codigo} · {unidade.categoria}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Button className="h-11" onClick={gerar} disabled={marcados.size === 0}>
          <Printer className="size-4" aria-hidden />
          Gerar {marcados.size > 0 ? `${marcados.size} ` : ""}etiqueta(s)
        </Button>
        {marcados.size > 0 ? (
          <Button
            variant="ghost"
            className="h-11"
            onClick={() => setMarcados(new Set())}
          >
            Limpar seleção
          </Button>
        ) : null}
      </div>
    </div>
  );
}
