import type { MetadataRoute } from "next";

/**
 * Web App Manifest (seção 33).
 *
 * Gerado pelo Next em `/manifest.webmanifest`, tipado — erro de digitação em
 * chave de manifest é silencioso e só aparece quando a instalação falha.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Estoque de Hardware",
    short_name: "Estoque",
    description:
      "Inventário inteligente de peças de informática: estoque, movimentações e montagens.",
    start_url: "/dashboard",
    // Onde o navegador volta quando a aplicação é reaberta pelo ícone.
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: "pt-BR",
    dir: "ltr",
    categories: ["business", "productivity", "utilities"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // Ícone "maskable" separado: o Android recorta o ícone em formatos
      // variados, e sem uma versão com margem o desenho fica cortado.
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Atalhos no menu de contexto do ícone instalado: as duas ações mais
    // frequentes no celular, segundo a seção 33.
    shortcuts: [
      {
        name: "Adicionar peça",
        short_name: "Adicionar",
        url: "/estoque/novo",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Buscar no estoque",
        short_name: "Buscar",
        url: "/estoque/itens",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
