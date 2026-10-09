import "server-only";

import { env } from "@/lib/env";
import { baixarPagina } from "@/server/services/store-price/http";

/**
 * Fontes de preço de mercado.
 *
 * Cada fonte recebe um termo de busca e devolve anúncios crus. Filtrar o que
 * é a mesma peça e tirar a média é trabalho do domínio
 * (`@/domain/pricing/preco-de-referencia`), não daqui.
 *
 * ## Por que estas fontes, e não OLX/Marketplace direto
 *
 * Testado em 09/10/2026: a busca da OLX responde 403 (proteção anti-robô) e a
 * página de busca do Mercado Livre devolve a tela de "tráfego suspeito". A API
 * pública de busca do Mercado Livre também responde 403 sem credencial.
 * Raspar contornando esses bloqueios é exatamente o que eles pedem para não
 * fazer — e quebra toda semana.
 *
 * - **Mercado Livre (usado)**: pela API oficial, quando há credencial de
 *   aplicativo configurada (`ML_CLIENT_ID` / `ML_CLIENT_SECRET`). É a fonte de
 *   preço de usado.
 * - **Buscapé (novo)**: comparador que agrega Kabum, Magalu, Amazon e outras
 *   lojas, e libera a página de busca para robô identificado. Serve de
 *   referência quando não há preço de usado — e a tela diz que é preço de novo.
 */

export type Condicao = "USADO" | "NOVO";

export interface Anuncio {
  fonte: string;
  titulo: string;
  preco: number;
  url: string;
  condicao: Condicao;
}

export interface Fonte {
  nome: string;
  condicao: Condicao;
  /** `false` quando a fonte não está configurada: nem tenta. */
  disponivel(): boolean;
  buscar(consulta: string): Promise<Anuncio[]>;
}

// ---------------------------------------------------------------------------
// Buscapé
// ---------------------------------------------------------------------------

interface HitBuscape {
  name?: string;
  price?: number;
  url?: string;
  merchantName?: string;
}

const buscape: Fonte = {
  nome: "Buscapé",
  condicao: "NOVO",
  disponivel: () => true,
  async buscar(consulta) {
    const url = `https://www.buscape.com.br/search?q=${encodeURIComponent(consulta)}`;
    const html = await baixarPagina(url);

    const bloco = html.match(
      /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
    );
    if (!bloco?.[1]) throw new Error("página sem dados de busca");

    const dados = JSON.parse(bloco[1]) as {
      props?: { initialReduxState?: { hits?: { hits?: HitBuscape[] } } };
    };
    const hits = dados.props?.initialReduxState?.hits?.hits ?? [];

    return hits
      .filter(
        (h): h is Required<Pick<HitBuscape, "name" | "price">> & HitBuscape =>
          typeof h.name === "string" && typeof h.price === "number",
      )
      .map((h) => ({
        fonte: h.merchantName ? `Buscapé · ${h.merchantName}` : "Buscapé",
        titulo: h.name,
        preco: h.price,
        url: h.url
          ? new URL(h.url, "https://www.buscape.com.br").toString()
          : url,
        condicao: "NOVO" as const,
      }));
  },
};

// ---------------------------------------------------------------------------
// Mercado Livre (API oficial)
// ---------------------------------------------------------------------------

let tokenEmCache: { valor: string; expiraEm: number } | null = null;

async function tokenDoMercadoLivre(): Promise<string> {
  if (tokenEmCache && tokenEmCache.expiraEm > Date.now() + 60_000) {
    return tokenEmCache.valor;
  }

  const { ML_CLIENT_ID, ML_CLIENT_SECRET } = env();
  const resposta = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: ML_CLIENT_ID ?? "",
      client_secret: ML_CLIENT_SECRET ?? "",
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!resposta.ok) {
    throw new Error(`credencial recusada (${resposta.status})`);
  }

  const corpo = (await resposta.json()) as {
    access_token: string;
    expires_in: number;
  };
  tokenEmCache = {
    valor: corpo.access_token,
    expiraEm: Date.now() + corpo.expires_in * 1000,
  };
  return corpo.access_token;
}

const mercadoLivre: Fonte = {
  nome: "Mercado Livre",
  condicao: "USADO",
  disponivel: () => Boolean(env().ML_CLIENT_ID && env().ML_CLIENT_SECRET),
  async buscar(consulta) {
    const token = await tokenDoMercadoLivre();
    const url =
      "https://api.mercadolibre.com/sites/MLB/search?" +
      new URLSearchParams({ q: consulta, condition: "used", limit: "30" });

    const resposta = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });

    if (!resposta.ok) {
      throw new Error(`busca recusada (${resposta.status})`);
    }

    const corpo = (await resposta.json()) as {
      results?: {
        title: string;
        price: number;
        permalink: string;
        condition?: string;
      }[];
    };

    return (corpo.results ?? [])
      .filter((r) => r.condition === undefined || r.condition === "used")
      .map((r) => ({
        fonte: "Mercado Livre",
        titulo: r.title,
        preco: r.price,
        url: r.permalink,
        condicao: "USADO" as const,
      }));
  },
};

/** Ordem de preferência: usado primeiro, loja como reserva. */
export const FONTES: Fonte[] = [mercadoLivre, buscape];
