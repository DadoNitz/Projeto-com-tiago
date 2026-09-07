import { describe, expect, it } from "vitest";

import { extrairProdutos } from "./ld-json";

/**
 * Os formatos abaixo não são inventados: são os que Kabum, Pichau e Terabyte
 * publicam hoje, reduzidos ao essencial. A busca da Kabum traz um array de
 * produtos com preço numérico; a página de produto da Pichau e da Terabyte
 * traz um produto só, com preço em string.
 */

const KABUM = `
<script type="application/ld+json">
[{"@context":"https://schema.org","@type":"Product","name":"Placa de Video MSI RTX 4060 Ventus 2X OC, 8GB",
  "offers":{"@type":"Offer","url":"https://www.kabum.com.br/produto/1/x","priceCurrency":"BRL","price":1799.9}},
 {"@context":"https://schema.org","@type":"Product","name":"PC Gamer Ryzen 5 5500, RTX 4060",
  "offers":{"@type":"Offer","url":"https://www.kabum.com.br/produto/2/y","priceCurrency":"BRL","price":6545.26}}]
</script>`;

const PICHAU = `
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"SSD Kingston NV2 1TB",
 "offers":{"@type":"Offer","url":"https://www.pichau.com.br/ssd","priceCurrency":"BRL","price":"588.22"}}
</script>`;

describe("extração do JSON-LD das lojas", () => {
  it("lê a lista de produtos da busca da Kabum", () => {
    const produtos = extrairProdutos(KABUM);

    expect(produtos).toHaveLength(2);
    expect(produtos[0]).toMatchObject({ preco: 1799.9 });
    expect(produtos[0]?.url).toContain("kabum.com.br");
  });

  it("lê o produto único da página da Pichau, com preço em string", () => {
    expect(extrairProdutos(PICHAU)[0]).toMatchObject({
      nome: "SSD Kingston NV2 1TB",
      preco: 588.22,
    });
  });

  it("aceita preço em formato brasileiro", () => {
    const html = `<script type="application/ld+json">
      {"@type":"Product","name":"Fonte 600W","offers":{"price":"R$ 1.799,90","url":"u"}}
    </script>`;

    expect(extrairProdutos(html)[0]?.preco).toBe(1799.9);
  });

  it("aceita offers em lista", () => {
    const html = `<script type="application/ld+json">
      {"@type":"Product","name":"Memória 16GB","offers":[{"price":249.9,"url":"u"}]}
    </script>`;

    expect(extrairProdutos(html)[0]?.preco).toBe(249.9);
  });

  it("acha produto dentro de @graph", () => {
    const html = `<script type="application/ld+json">
      {"@graph":[{"@type":"WebSite"},{"@type":"Product","name":"Cooler","offers":{"price":89,"url":"u"}}]}
    </script>`;

    expect(extrairProdutos(html)).toHaveLength(1);
  });
});

describe("o que precisa ser descartado", () => {
  it("bloco quebrado não derruba os outros da mesma página", () => {
    expect(extrairProdutos(`<script type="application/ld+json">{quebrado</script>${PICHAU}`)).toHaveLength(1);
  });

  it("produto sem preço não vira candidato", () => {
    // Preço ausente vira 0 se aceito, e 0 destruiria qualquer comparação.
    const html = `<script type="application/ld+json">
      {"@type":"Product","name":"Placa-mãe X","offers":{"url":"u"}}
    </script>`;

    expect(extrairProdutos(html)).toHaveLength(0);
  });

  it("preço zerado é recusado", () => {
    const html = `<script type="application/ld+json">
      {"@type":"Product","name":"Produto esgotado","offers":{"price":0,"url":"u"}}
    </script>`;

    expect(extrairProdutos(html)).toHaveLength(0);
  });

  it("página sem JSON-LD devolve lista vazia", () => {
    expect(extrairProdutos("<html><body>R$ 1.799,90</body></html>")).toHaveLength(0);
  });
});
