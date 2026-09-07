/**
 * Índice de produtos a partir do sitemap público das lojas.
 *
 * Pichau e Terabyte proíbem a busca no `robots.txt` — a Pichau bloqueia toda
 * URL com query (`Disallow: /*?*`), a Terabyte bloqueia `/busca` e devolve 403
 * de fato. As duas, porém, liberam a página do produto e publicam sitemap.
 *
 * Então o caminho respeitoso é o inverso do óbvio: em vez de usar a busca
 * delas, monto meu próprio índice a partir do sitemap que elas publicam
 * justamente para ser lido por máquina, e só depois busco a página de um
 * produto específico.
 *
 * Isto roda em `npm run precos:indexar`, nunca durante uma requisição: são
 * vários MB de XML por loja.
 */

import { TIMEOUT_DE_SITEMAP_MS, baixarPagina } from "./http";

export interface ProdutoIndexado {
  storeSlug: string;
  name: string;
  url: string;
}

export interface ResultadoDaIndexacao {
  produtos: ProdutoIndexado[];
  /** Partes do catálogo que não vieram. Quem chama precisa ver isto. */
  falhas: { parte: string; motivo: string }[];
}

/** Sub-sitemaps da Terabyte que têm peça; o resto é institucional. */
const CATEGORIAS_TERABYTE = [
  "hardware",
  "perifericos",
  "monitores",
  "notebooks",
  "redes",
  "gabinetes",
  "fontes",
  "refrigeracao",
];

function extrairLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)]
    .map((m) => m[1])
    .filter((u): u is string => typeof u === "string");
}

/**
 * Nome a partir do slug da URL.
 *
 * "placa-de-video-galax-rtx-3050-8gb" vira "placa de video galax rtx 3050
 * 8gb". Não é o título oficial, mas o casamento normaliza os dois lados de
 * qualquer jeito — e evita baixar 30 mil páginas só para ler o `<title>`.
 */
function nomeDoSlug(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\s+/g, " ").trim();
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Pausa entre sitemaps, e espera antes de repetir.
 *
 * Números escolhidos por observação, não por chute: com 1 segundo entre
 * categorias, a Terabyte começou a responder 403 em todas — e voltou ao
 * normal sozinha minutos depois. Era rajada minha, não bloqueio dela.
 *
 * Este script roda uma vez por semana e ninguém espera na frente dele.
 * Lentidão aqui não custa nada; insistência custa o acesso.
 */
const PAUSA_ENTRE_PARTES_MS = 6_000;
const ESPERA_PARA_REPETIR_MS = 20_000;

async function indexarTerabyte(): Promise<ResultadoDaIndexacao> {
  const achados: ProdutoIndexado[] = [];
  const falhas: { parte: string; motivo: string }[] = [];

  for (const categoria of CATEGORIAS_TERABYTE) {
    // A loja está fazendo um favor ao publicar o sitemap; não se retribui
    // isso com uma rajada de requisições.
    await espera(PAUSA_ENTRE_PARTES_MS);

    let xml: string;
    try {
      xml = await baixarPagina(
        `https://www.terabyteshop.com.br/${categoria}/sitemap.xml`,
        TIMEOUT_DE_SITEMAP_MS,
        ESPERA_PARA_REPETIR_MS,
      );
    } catch (erro) {
      // Categoria que falha não invalida as outras — mas some do índice, e
      // sumir em silêncio já produziu um índice só de periférico uma vez.
      falhas.push({
        parte: categoria,
        motivo: erro instanceof Error ? erro.message : "falhou",
      });
      continue;
    }

    for (const url of extrairLocs(xml)) {
      // Só /produto/<id>/<slug>: o resto é categoria e página institucional.
      const m = /\/produto\/\d+\/([a-z0-9-]+)$/i.exec(url);
      if (!m?.[1]) continue;
      achados.push({ storeSlug: "terabyte", name: nomeDoSlug(m[1]), url });
    }
  }

  return { produtos: achados, falhas };
}

async function indexarPichau(): Promise<ResultadoDaIndexacao> {
  const xml = await baixarPagina(
    "https://www.pichau.com.br/media/sitemap.xml",
    TIMEOUT_DE_SITEMAP_MS,
    ESPERA_PARA_REPETIR_MS,
  );
  const achados: ProdutoIndexado[] = [];

  for (const url of extrairLocs(xml)) {
    // Produto da Pichau é um único segmento, longo e com muitos hífens;
    // categoria é curta ("/placa-de-video"). Cinco hífens separa os dois sem
    // precisar baixar nada para conferir.
    const m = /^https:\/\/www\.pichau\.com\.br\/([a-z0-9-]+)$/i.exec(url);
    const slug = m?.[1];
    if (!slug) continue;
    if ((slug.match(/-/g)?.length ?? 0) < 5) continue;

    achados.push({ storeSlug: "pichau", name: nomeDoSlug(slug), url });
  }

  return { produtos: achados, falhas: [] };
}

export async function indexarLoja(loja: string): Promise<ResultadoDaIndexacao> {
  if (loja === "terabyte") return indexarTerabyte();
  if (loja === "pichau") return indexarPichau();
  throw new Error(`loja sem indexador: ${loja}`);
}
