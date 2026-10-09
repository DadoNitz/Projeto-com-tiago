import { BrandMark } from "@/components/layout/brand";

export function AppLoader({ compacto = false }: { compacto?: boolean }) {
  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center gap-5 ${compacto ? "py-10" : "min-h-[60dvh] p-6"}`}
    >
      <div className="relative flex size-20 items-center justify-center">
        <div className="loader-orbit border-led/25 border-t-led absolute inset-0 rounded-3xl border-2" />
        <BrandMark className="size-14" />
      </div>
      <div className="text-center">
        <p className="font-heading text-lg font-extrabold tracking-[-0.03em]">bancada</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Preparando seu painel…
        </p>
      </div>
      <div
        className="bg-muted h-1 w-28 overflow-hidden rounded-full"
        aria-hidden
      >
        <div className="loader-progress bg-led h-full w-1/2 rounded-full" />
      </div>
    </div>
  );
}
