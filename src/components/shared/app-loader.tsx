import { CircuitBoard } from "lucide-react";

export function AppLoader({ compacto = false }: { compacto?: boolean }) {
  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center gap-5 ${compacto ? "py-10" : "min-h-[60dvh] p-6"}`}
    >
      <div className="relative flex size-20 items-center justify-center">
        <div className="loader-orbit absolute inset-0 rounded-3xl border-2 border-primary/15 border-t-primary" />
        <div className="bg-primary text-primary-foreground flex size-14 items-center justify-center rounded-2xl">
          <CircuitBoard className="size-8" aria-hidden />
        </div>
      </div>
      <div className="text-center">
        <p className="font-semibold tracking-tight">Estoque de Hardware</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Preparando seu painel…
        </p>
      </div>
      <div
        className="bg-primary/10 h-1 w-28 overflow-hidden rounded-full"
        aria-hidden
      >
        <div className="loader-progress bg-primary h-full w-1/2 rounded-full" />
      </div>
    </div>
  );
}
