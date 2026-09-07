import { redirect } from "next/navigation";

import { BottomNav } from "@/components/layout/bottom-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { SectionNav } from "@/components/layout/section-nav";
import { Topbar } from "@/components/layout/topbar";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { PwaProvider } from "@/components/pwa/pwa-provider";
import { getContext } from "@/server/session";

/**
 * Shell da área autenticada.
 *
 * Layout adaptativo (seção 33): sidebar permanente a partir de `lg`, barra
 * inferior no celular. O `pb-16` reserva o espaço da barra inferior para que
 * ela nunca cubra o último item de uma lista.
 *
 * A sessão é verificada aqui além do `proxy.ts`: o proxy protege a rota, mas
 * é o servidor que decide de fato — e é daqui que sai o papel do usuário para
 * a navegação.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  return (
    <div className="flex min-h-dvh">
      <a
        href="#conteudo"
        className="bg-primary text-primary-foreground sr-only fixed top-2 left-2 z-[110] rounded-lg p-3 focus:not-sr-only"
      >
        Pular para o conteúdo
      </a>
      <Sidebar role={ctx.role} />

      <div className="flex min-w-0 flex-1 flex-col">
        <PwaProvider>
          <Topbar nome={ctx.name} role={ctx.role} />
          <main
            id="conteudo"
            className="app-main min-w-0 flex-1 px-4 pt-5 sm:px-6 lg:px-8 lg:pt-7"
          >
            <SectionNav role={ctx.role} />
            {children}
          </main>
        </PwaProvider>
      </div>

      {/* O "Adicionar" mora so na barra inferior, com destaque proprio. Havia
          tambem um botao flutuante fazendo a mesma coisa, e os dois juntos
          disputavam o mesmo canto da tela. */}
      <BottomNav role={ctx.role} />
      <InstallPrompt />
    </div>
  );
}
