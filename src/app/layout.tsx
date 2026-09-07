import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { StartupLoader } from "@/components/layout/startup-loader";

import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_NAME = "Estoque de Hardware";

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description:
    "Inventário inteligente de peças de informática: estoque, movimentações e montagens.",
  applicationName: APP_NAME,
  manifest: "/manifest.webmanifest",
  // Necessário para a instalação em iOS via "Adicionar à Tela de Início",
  // que não lê o manifest da mesma forma que o Android.
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  // Sistema interno: não deve ser indexado.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Sem maximumScale/userScalable: bloquear o zoom prejudica acessibilidade,
  // e a interface já usa alvos de toque adequados.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f7f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        <StartupLoader />
        {children}
        <Toaster richColors closeButton position="top-center" />
      </body>
    </html>
  );
}
