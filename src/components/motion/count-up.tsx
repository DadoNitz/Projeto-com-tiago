"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";

gsap.registerPlugin(useGSAP);

/**
 * Número que conta até o valor final (no estilo do CountUp do React Bits),
 * feito com GSAP. Renderiza o texto final no servidor, então a tela nunca
 * aparece com zero; a animação só roda no cliente e respeita "reduzir movimento".
 */
const FORMATOS = {
  numero: (n: number) => Math.round(n).toLocaleString("pt-BR"),
  moeda: (n: number) =>
    n.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    }),
};

export function CountUp({
  valor,
  formato = "numero",
  duracao = 1.1,
  className,
}: {
  valor: number;
  /** Formato fixo (função não atravessa a fronteira servidor → cliente). */
  formato?: keyof typeof FORMATOS;
  duracao?: number;
  className?: string;
}) {
  const formatar = FORMATOS[formato];
  const ref = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || !Number.isFinite(valor) || valor === 0) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const estado = { n: 0 };
      gsap.to(estado, {
        n: valor,
        duration: duracao,
        ease: "power3.out",
        onUpdate: () => {
          el.textContent = formatar(estado.n);
        },
        onComplete: () => {
          el.textContent = formatar(valor);
        },
      });
    },
    { dependencies: [valor], scope: ref },
  );

  return (
    <span ref={ref} data-num className={className}>
      {formatar(valor)}
    </span>
  );
}
