import { Skeleton } from "@/components/ui/skeleton";

export default function CarregandoEstoque() {
  return (
    <div className="mx-auto max-w-7xl space-y-5" role="status">
      <span className="sr-only">Carregando o estoque</span>
      <Skeleton className="h-16 w-56" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton
            key={i}
            className={`h-28 rounded-2xl ${i === 2 ? "hidden lg:block" : ""}`}
          />
        ))}
      </div>
      <Skeleton className="h-32 w-full rounded-2xl" />
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-44 w-full rounded-2xl lg:h-24" />
      ))}
    </div>
  );
}
