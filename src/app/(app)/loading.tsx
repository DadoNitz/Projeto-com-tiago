import { Skeleton } from "@/components/ui/skeleton";

/**
 * Espera padrão da área autenticada.
 *
 * Toda página aqui é `force-dynamic` e consulta o banco antes de renderizar.
 * Sem esta fronteira, tocar num item do menu não produzia efeito visível
 * nenhum até o servidor responder — no celular, em rede ruim, a interface
 * parecia travada e o toque era repetido.
 *
 * As telas mais pesadas trazem um esqueleto com o formato delas; este é o
 * que atende todas as outras.
 */
export default function Carregando() {
  return (
    <div className="mx-auto max-w-7xl space-y-6" role="status">
      <span className="sr-only">Carregando</span>

      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>

      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
