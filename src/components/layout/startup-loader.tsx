"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef, useState } from "react";

gsap.registerPlugin(useGSAP);

const CHAVE = "bancada-abertura";

/*
 * Roda antes da hidratação: se a abertura já passou nesta sessão do app,
 * marca o <html> e o CSS esconde o overlay na hora, sem piscar.
 */
const SCRIPT_SESSAO = `try{if(sessionStorage.getItem("${CHAVE}"))document.documentElement.dataset.abertura="vista"}catch(e){}`;

/* Estado inicial no próprio HTML, para valer antes do CSS do app carregar. */
const CSS_INICIAL = `[data-abertura="vista"] .abertura{display:none}.abertura .ab-fundo,.abertura .ab-tampo,.abertura .ab-pe,.abertura .ab-pino,.abertura .ab-letra,.abertura .ab-sub,.abertura .ab-led{opacity:0}`;

/**
 * Abertura do app: a marca da Bancada se monta peça por peça (tampo, pés,
 * pinos do chip), o nome sobe letra a letra, a faixa de LED corre e a tela
 * levanta como uma cortina revelando o app.
 *
 * - Uma vez por sessão: navegar ou recarregar não repete a apresentação.
 * - "Reduzir movimento": some na hora.
 * - Sem JavaScript ou se algo falhar, o CSS tira o overlay sozinho (failsafe).
 */
export function StartupLoader() {
  const raiz = useRef<HTMLDivElement>(null);
  const [fim, setFim] = useState(false);

  useGSAP(
    () => {
      const el = raiz.current;
      if (!el) return;

      const encerrar = () => {
        try {
          sessionStorage.setItem(CHAVE, "1");
        } catch {
          // Sem storage (aba privada): só não lembra entre recarregamentos.
        }
        setFim(true);
      };

      if (document.documentElement.dataset.abertura === "vista") {
        setFim(true);
        return;
      }
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        encerrar();
        return;
      }

      const q = gsap.utils.selector(el);
      const tl = gsap.timeline({
        defaults: { ease: "power3.out" },
        onComplete: encerrar,
      });

      // As peças começam invisíveis pelo CSS (sem piscar o estado final antes
      // da hidratação); cada passo define o "de" e o "para" explicitamente.
      tl.set(el, { animation: "none" })
        .fromTo(q(".ab-fundo"), { scale: 0.4, opacity: 0, transformOrigin: "50% 50%" }, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(1.6)" })
        .fromTo(q(".ab-tampo"), { scaleX: 0, opacity: 1, transformOrigin: "50% 50%" }, { scaleX: 1, duration: 0.35 }, "-=0.15")
        .fromTo(q(".ab-pe"), { scaleY: 0, opacity: 1, transformOrigin: "50% 0%" }, { scaleY: 1, duration: 0.3, stagger: 0.06 }, "-=0.1")
        .fromTo(q(".ab-pino"), { y: -14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, stagger: 0.05, ease: "back.out(3)" }, "-=0.15")
        .fromTo(q(".ab-letra"), { yPercent: 110, opacity: 1 }, { yPercent: 0, duration: 0.45, stagger: 0.03 }, "-=0.3")
        .fromTo(q(".ab-sub"), { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.3 }, "-=0.25")
        .fromTo(q(".ab-led"), { scaleX: 0, opacity: 1 }, { scaleX: 1, duration: 0.55, ease: "power2.inOut" }, "-=0.2")
        .to(q(".ab-conteudo"), { y: -24, opacity: 0, duration: 0.3, ease: "power2.in" }, "+=0.05")
        .to(el, { clipPath: "inset(0% 0% 100% 0%)", duration: 0.55, ease: "power4.inOut" }, "-=0.15");

      // ~2s no total: presença de marca sem fazer ninguém esperar.
      tl.timeScale(1.35);
    },
    { scope: raiz },
  );

  if (fim) return null;

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SCRIPT_SESSAO }} />
      <style>{CSS_INICIAL}</style>
      <div
        ref={raiz}
        aria-hidden
        className="abertura bg-background fixed inset-0 z-[100] flex items-center justify-center"
        style={{ clipPath: "inset(0% 0% 0% 0%)" }}
      >
        <div className="ab-conteudo flex flex-col items-center gap-5">
          <svg viewBox="0 0 56 56" className="size-24 text-foreground">
            <rect className="ab-fundo" width="56" height="56" rx="15" fill="currentColor" style={{ transformOrigin: "50% 50%", transformBox: "fill-box" }} />
            <rect className="ab-tampo" x="11" y="22" width="34" height="7" rx="2" fill="#C5F23C" style={{ transformBox: "fill-box" }} />
            <rect className="ab-pe" x="15" y="29" width="5" height="15" rx="1.5" fill="#C5F23C" style={{ transformBox: "fill-box" }} />
            <rect className="ab-pe" x="36" y="29" width="5" height="15" rx="1.5" fill="#C5F23C" style={{ transformBox: "fill-box" }} />
            <g className="fill-background">
              {[17, 24, 31, 38].map((x) => (
                <rect key={x} className="ab-pino" x={x} y="13" width="3" height="6" rx="1" />
              ))}
            </g>
          </svg>

          <div className="flex flex-col items-center gap-1.5">
            <p className="font-heading flex overflow-hidden text-4xl leading-none font-extrabold tracking-[-0.04em]">
              {"bancada".split("").map((letra, i) => (
                <span key={i} className="ab-letra inline-block">
                  {letra}
                </span>
              ))}
            </p>
            <p className="ab-sub text-muted-foreground font-mono text-xs">
              estoque · montagens · vendas
            </p>
          </div>

          <div className="bg-muted h-1 w-32 overflow-hidden rounded-full">
            <div className="ab-led bg-led h-full w-full origin-left rounded-full" />
          </div>
        </div>
      </div>
    </>
  );
}
