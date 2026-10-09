import "server-only";

import { env } from "@/lib/env";
import { prisma } from "@/server/db/client";
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
 * - **Mercado Livre**: pela API oficial, quando há credencial de aplicativo
 *   (`ML_CLIENT_ID` / `ML_CLIENT_SECRET`). Só o catálogo é liberado, e ele traz
 *   quase só oferta de peça nova (ver abaixo); oferta usada, quando aparece,
 *   entra como usado.
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
  /** `false` quando a fonte não está configurada: nem tenta. */
  disponivel(): boolean | Promise<boolean>;
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

/**
 * Credencial do app do Mercado Livre.
 *
 * Variável de ambiente primeiro; na falta dela, a tabela de configuração
 * (`app_settings`, chaves `ml.client_id` / `ml.client_secret`). A segunda
 * existe para poder ligar a fonte sem acesso ao painel da hospedagem.
 */
async function credencialDoMercadoLivre(): Promise<{
  id: string;
  segredo: string;
} | null> {
  const { ML_CLIENT_ID, ML_CLIENT_SECRET } = env();
  if (ML_CLIENT_ID && ML_CLIENT_SECRET) {
    return { id: ML_CLIENT_ID, segredo: ML_CLIENT_SECRET };
  }
  const linhas = await prisma.appSetting.findMany({
    where: { key: { in: ["ml.client_id", "ml.client_secret"] } },
  });
  const valor = (chave: string) => linhas.find((l) => l.key === chave)?.value;
  const id = valor("ml.client_id");
  const segredo = valor("ml.client_secret");
  return id && segredo ? { id, segredo } : null;
}

async function tokenDoMercadoLivre(): Promise<string> {
  if (tokenEmCache && tokenEmCache.expiraEm > Date.now() + 60_000) {
    return tokenEmCache.valor;
  }

  const credencial = await credencialDoMercadoLivre();
  if (!credencial) throw new Error("app do Mercado Livre não configurado");
  const resposta = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: credencial.id,
      client_secret: credencial.segredo,
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

/**
 * Testado em 09/10/2026 com credencial válida: `/sites/MLB/search` continua
 * respondendo 403 (a busca de anúncios é restrita a parceiros). O que a API
 * libera é o catálogo (`/products/search`) e as ofertas de cada produto do
 * catálogo (`/products/{id}/items`). Essas ofertas são quase sempre de peça
 * nova — por isso cada anúncio leva a própria condição, e só conta como usado
 * o que o Mercado Livre disser que é usado.
 */
const PRODUTOS_DO_CATALOGO = 6;

const mercadoLivre: Fonte = {
  nome: "Mercado Livre",
  disponivel: async () => (await credencialDoMercadoLivre()) !== null,
  async buscar(consulta) {
    const token = await tokenDoMercadoLivre();
    const cabecalhos = { Authorization: `Bearer ${token}` };

    const busca = await fetch(
      "https://api.mercadolibre.com/products/search?" +
        new URLSearchParams({ status: "active", site_id: "MLB", q: consulta }),
      {
        headers: cabecalhos,
        signal: AbortSignal.timeout(12_000),
        cache: "no-store",
      },
    );
    if (!busca.ok) throw new Error(`catálogo recusou (${busca.status})`);

    const { results: produtos = [] } = (await busca.json()) as {
      results?: { id: string; name: string }[];
    };

    const ofertas = await Promise.all(
      produtos.slice(0, PRODUTOS_DO_CATALOGO).map(async (produto) => {
        const resposta = await fetch(
          `https://api.mercadolibre.com/products/${produto.id}/items?limit=20`,
          {
            headers: cabecalhos,
            signal: AbortSignal.timeout(12_000),
            cache: "no-store",
          },
        );
        // 404 = produto de catálogo sem oferta ativa. Normal, não é falha.
        if (!resposta.ok) return [];
        const { results = [] } = (await resposta.json()) as {
          results?: { item_id: string; price: number; condition?: string }[];
        };
        return results.map(
          (oferta): Anuncio => ({
            fonte: "Mercado Livre",
            titulo: produto.name,
            preco: oferta.price,
            url: `https://produto.mercadolivre.com.br/${oferta.item_id.replace(/^MLB/, "MLB-")}`,
            condicao: oferta.condition === "used" ? "USADO" : "NOVO",
          }),
        );
      }),
    );

    return ofertas.flat();
  },
};

/** Todas são consultadas em paralelo; a condição vem de cada anúncio. */
export const FONTES: Fonte[] = [mercadoLivre, buscape];
