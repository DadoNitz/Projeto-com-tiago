import { cn } from "@/lib/utils";

/**
 * Marca da Bancada: o tampo e os pés da bancada em verde LED, com os pinos de
 * um chip em cima. O quadrado segue a cor do texto, então inverte no escuro.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 56 56"
      aria-hidden
      className={cn("size-9 shrink-0 text-foreground", className)}
    >
      <rect width="56" height="56" rx="15" fill="currentColor" />
      <rect x="11" y="22" width="34" height="7" rx="2" fill="#C5F23C" />
      <rect x="15" y="29" width="5" height="15" rx="1.5" fill="#C5F23C" />
      <rect x="36" y="29" width="5" height="15" rx="1.5" fill="#C5F23C" />
      <g className="fill-background">
        <rect x="17" y="13" width="3" height="6" rx="1" />
        <rect x="24" y="13" width="3" height="6" rx="1" />
        <rect x="31" y="13" width="3" height="6" rx="1" />
        <rect x="38" y="13" width="3" height="6" rx="1" />
      </g>
    </svg>
  );
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-heading text-[22px] leading-none font-extrabold tracking-[-0.04em]",
        className,
      )}
    >
      bancada
    </span>
  );
}
