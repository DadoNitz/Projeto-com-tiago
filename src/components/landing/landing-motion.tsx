"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(useGSAP, ScrollTrigger);

/**
 * Movimento da landing, num lugar só. Não renderiza nada: anima o que a
 * página (servidor) já desenhou, sempre a partir de um estado visível — se o
 * JavaScript não carregar, a página continua completa.
 */
export function LandingMotion() {
  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Abertura: título sobe palavra por palavra, celular entra inclinado.
    gsap
      .timeline({ defaults: { ease: "power3.out" } })
      .from(".lp .hero h1 .w", { yPercent: 110, duration: 0.7, stagger: 0.035 })
      .from(".lp .hero .tag", { scale: 0, rotate: -20, duration: 0.5, ease: "back.out(2.2)" }, "-=0.45")
      .from(".lp #lp-phone", { y: 40, rotateX: 12, duration: 1, ease: "power4.out" }, 0.1)
      .from(".lp .float-card", { scale: 0.6, duration: 0.5, stagger: 0.12, ease: "back.out(1.8)" }, 0.6);

    // Números contam até o valor quando aparecem.
    gsap.utils.toArray<HTMLElement>(".lp [data-count]").forEach((el) => {
      const fim = Number(el.dataset.count);
      // Só mexe no texto quando o número entra na tela; até lá ele mostra o
      // valor final que veio do servidor.
      ScrollTrigger.create({
        trigger: el,
        start: "top 90%",
        once: true,
        onEnter: () => {
          const estado = { v: 0 };
          gsap.to(estado, {
            v: fim,
            duration: 1.4,
            ease: "power2.out",
            onUpdate: () => {
              el.textContent = String(Math.round(estado.v));
            },
          });
        },
      });
    });

    // Parallax leve no celular e nos cartões flutuantes.
    gsap.utils.toArray<HTMLElement>(".lp [data-float]").forEach((el) => {
      gsap.to(el, {
        y: 60 * Number(el.dataset.float),
        ease: "none",
        scrollTrigger: { trigger: ".lp .hero", start: "top top", end: "bottom top", scrub: true },
      });
    });
    gsap.to(".lp #lp-phone", {
      rotate: -4,
      y: 30,
      ease: "none",
      scrollTrigger: { trigger: ".lp .hero", start: "top top", end: "bottom top", scrub: true },
    });

    // Linha dos 4 passos enche conforme rola; cada passo acende ao chegar.
    gsap.fromTo(
      ".lp #lp-flow-fill",
      { scaleX: 0 },
      {
        scaleX: 1,
        ease: "none",
        scrollTrigger: { trigger: ".lp #lp-flow", start: "top 80%", end: "bottom 55%", scrub: true },
      },
    );
    gsap.utils.toArray<HTMLElement>(".lp .step .dot").forEach((dot, i) => {
      ScrollTrigger.create({
        trigger: ".lp #lp-flow",
        start: `top+=${i * 40} 70%`,
        onEnter: () => {
          dot.classList.add("aceso");
          gsap.fromTo(dot, { scale: 0.8 }, { scale: 1, duration: 0.5, ease: "back.out(3)" });
        },
      });
    });

    // Faixa de peças: anda sozinha e acelera com a velocidade da rolagem.
    const faixa = gsap.to(".lp #lp-track", { xPercent: -50, duration: 28, ease: "none", repeat: -1 });
    ScrollTrigger.create({
      onUpdate: (self) => {
        const v = Math.min(Math.abs(self.getVelocity()) / 300, 6);
        gsap
          .timeline({ overwrite: true })
          .to(faixa, { timeScale: 1 + v, duration: 0.2 })
          .to(faixa, { timeScale: 1, duration: 1.2 });
      },
    });

    // Cartões sobem um pouco ao entrar (nada fica escondido).
    gsap.utils.toArray<HTMLElement>(".lp .cell").forEach((cell) => {
      gsap.from(cell, {
        y: 28,
        duration: 0.8,
        ease: "power3.out",
        scrollTrigger: { trigger: cell, start: "top 92%", once: true },
      });
    });

    // Botões "magnéticos" no desktop.
    if (window.matchMedia("(hover: hover)").matches) {
      gsap.utils.toArray<HTMLElement>(".lp .magnet").forEach((b) => {
        b.addEventListener("mousemove", (e) => {
          const r = b.getBoundingClientRect();
          gsap.to(b, {
            x: (e.clientX - r.left - r.width / 2) * 0.25,
            y: (e.clientY - r.top - r.height / 2) * 0.35,
            duration: 0.3,
          });
        });
        b.addEventListener("mouseleave", () => {
          gsap.to(b, { x: 0, y: 0, duration: 0.6, ease: "elastic.out(1,0.4)" });
        });
      });
    }
  });

  return null;
}
