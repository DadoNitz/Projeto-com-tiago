"use client";

import { useEffect, useState } from "react";
import { AppLoader } from "@/components/shared/app-loader";

/** Uma apresentação curta por abertura, sem atrasar a navegação entre telas. */
export function StartupLoader() {
  const [visivel, setVisivel] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(
      () => setVisivel(false),
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 650,
    );
    return () => window.clearTimeout(timer);
  }, []);
  if (!visivel) return null;
  return (
    <div className="bg-background pointer-events-none fixed inset-0 z-[100] flex items-center justify-center">
      <AppLoader />
    </div>
  );
}
