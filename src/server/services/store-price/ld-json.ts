/**
 * Leitura do JSON-LD que as lojas publicam na própria página.
 *
 * As três lojas — Kabum, Pichau, Terabyte — marcam seus produtos com
 * `schema.org/Product` num `<script type="application/ld+json">`. Isso importa
 * mais do que parece: é dado **declarado pela loja para ser lido por
 * máquina**, e não HTML de layout. Um seletor de CSS quebra quando o
 * designer mexe na página; o JSON-LD só muda se a loja decidir sair do
 * Google, o que não acontece.
 *
 * É por isso que a raspagem aqui se limita a ele. Se o JSON-LD sumir, a
 * consulta falha de forma limpa e a nota diz que não conseguiu consultar —
 * em vez de ler o número errado de um `<span>` que mudou de lugar.
 */

export interface ProdutoDaLoja {
  nome: string;
  url: string;
  preco: number;
}

/**
 * Aceita número, "4305.87" e "R$ 4.305,87".
 *
 * Zero é recusado nos dois formatos: loja publica `price: 0` em produto
 * esgotado, e zero entrando na comparação faria qualquer oferta parecer cara.
 */
function comoPreco(valor: unknown): number | null {
  if (typeof valor === "number") {
    return Number.isFinite(valor) && valor > 0 ? valor : null;
  }
  if (typeof valor !== "string") return null;

  const limpo = valor.replace(/[^\d.,]/g, "");
  if (limpo === "") return null;

  // "4.305,87" é pt-BR; "4305.87" é o formato do schema.org.
  const normalizado = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo;

  const numero = Number(normalizado);
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

function primeiraOferta(offers: unknown): Record<string, unknown> | null {
  if (Array.isArray(offers)) {
    const primeira = offers.find((o) => o && typeof o === "object");
    return (primeira as Record<string, unknown>) ?? null;
  }
  return offers && typeof offers === "object"
    ? (offers as Record<string, unknown>)
    : null;
}

function comoProduto(no: unknown): ProdutoDaLoja | null {
  if (!no || typeof no !== "object") return null;

  const objeto = no as Record<string, unknown>;
  if (objeto["@type"] !== "Product") return null;

  const nome = typeof objeto.name === "string" ? objeto.name.trim() : "";
  if (nome === "") return null;

  const oferta = primeiraOferta(objeto.offers);
  if (!oferta) return null;

  const preco = comoPreco(oferta.price);
  if (preco === null) return null;

  const url =
    typeof oferta.url === "string"
      ? oferta.url
      : typeof objeto.url === "string"
        ? objeto.url
        : "";

  return { nome, url, preco };
}

/** Percorre objeto, array e `@graph` atrás de Products. */
function coletar(no: unknown, achados: ProdutoDaLoja[]): void {
  if (Array.isArray(no)) {
    for (const item of no) coletar(item, achados);
    return;
  }

  if (!no || typeof no !== "object") return;

  const produto = comoProduto(no);
  if (produto) {
    achados.push(produto);
    return;
  }

  const grafo = (no as Record<string, unknown>)["@graph"];
  if (grafo) coletar(grafo, achados);
}

const BLOCO = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/**
 * Extrai todo produto anunciado na página.
 *
 * Página de busca da Kabum traz dez; página de produto da Pichau e da
 * Terabyte traz um. O chamador é que decide qual serve.
 */
export function extrairProdutos(html: string): ProdutoDaLoja[] {
  const achados: ProdutoDaLoja[] = [];

  for (const encontro of html.matchAll(BLOCO)) {
    const bruto = encontro[1]?.trim();
    if (!bruto) continue;

    try {
      coletar(JSON.parse(bruto), achados);
    } catch {
      // Bloco malformado numa página não invalida os outros. Seguir é melhor
      // que descartar a página inteira por causa de um script quebrado.
    }
  }

  return achados;
}
