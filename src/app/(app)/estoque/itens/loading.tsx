import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto da listagem de estoque.
 *
 * A coluna de filtros só existe a partir de `lg`, igual à tela real: mostrar
 * um bloco de filtros no celular anunciaria algo que não vai aparecer.
 */
export default function CarregandoEstoque() {
  return (
    <div className="mx-auto max-w-7xl space-y-4" role="status">
      <span className="sr-only">Carregando o estoque</span>

      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-52" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Skeleton className="hidden h-96 rounded-lg lg:block" />

        <div className="min-w-0 space-y-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-[76px] w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
