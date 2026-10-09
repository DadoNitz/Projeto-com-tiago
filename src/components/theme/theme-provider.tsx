"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Tema claro/escuro. Segue o celular por padrão ("system") e lembra a escolha
 * manual. A classe `.dark` no <html> troca todos os tokens do globals.css.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
      storageKey="bancada-tema"
    >
      {children}
    </NextThemesProvider>
  );
}
