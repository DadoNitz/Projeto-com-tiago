import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto com o formato do dashboard: quatro indicadores em cima, a lista
 * de categorias ocupando duas colunas e a pilha de alertas ao lado.
 *
 * Vale copiar o layout em vez de mostrar barras genéricas — o conteúdo entra
 * no lugar onde o esqueleto já estava, sem o pulo que reposiciona o que a
 * pessoa acabou de mirar.
 */
export default function CarregandoDashboard() {
  return (
    <div className="mx-auto max-w-7xl space-y-6" role="status">
      <span className="sr-only">Carregando o dashboard</span>

      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[106px] rounded-lg" />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-lg lg:col-span-2" />
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-lg" />
          <Skeleton className="h-36 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
