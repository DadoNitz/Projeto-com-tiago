import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto do histórico: cabeçalho, a fileira de filtros e a linha do tempo. */
export default function CarregandoMovimentacoes() {
  return (
    <div className="mx-auto max-w-4xl space-y-4" role="status">
      <span className="sr-only">Carregando as movimentações</span>

      <div className="space-y-2">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {[64, 80, 72, 96, 68, 84].map((largura, i) => (
          <Skeleton
            key={i}
            className="h-[30px] rounded-full"
            style={{ width: largura }}
          />
        ))}
      </div>

      <Skeleton className="h-[520px] rounded-lg" />
    </div>
  );
}
