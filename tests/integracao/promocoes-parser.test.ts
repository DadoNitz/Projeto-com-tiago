import { describe, expect, it } from "vitest";

import { extrairPromocao } from "@/server/services/deal-parser.service";

/**
 * Leitura de mensagem de grupo de promocao.
 *
 * Mensagem de grupo nao tem formato: cada um escreve de um jeito, usa emoji
 * diferente, escreve "1,8k". O que se testa aqui e o comportamento que
 * protege o sistema — descartar o que nao e oferta de hardware, e nunca
 * inventar preco.
 *
 * Chama o modelo de verdade, e por isso e opt-in — mesma regra dos demais
 * testes de IA (ver etiqueta.test.ts). Cada execucao consome cota do plano
 * gratuito, que e por minuto: quatro chamadas seguidas aqui, somadas as dos
 * outros arquivos, estouram o limite e a suite passa a falhar por 429 — uma
 * falha que nao diz nada sobre o codigo.
 *
 * Rodar com:  TESTAR_IA=1 npm test
 */
const temChave =
  Boolean(process.env.GEMINI_API_KEY) && process.env.TESTAR_IA === "1";

describe.skipIf(!temChave)("extrair promocao de mensagem", () => {
  it("le uma oferta tipica de grupo, com emoji e preco no PIX", async () => {
    const r = await extrairPromocao(`🔥🔥 BAIXOU MAIS!
RTX 4060 VENTUS 2X BLACK 8GB
De R$ 2.199,00 por R$ 1.799,90 no PIX
Cupom: KABUM50
https://www.kabum.com.br/produto/123456`);

    expect(r).not.toBeNull();
    expect(r!.title.toLowerCase()).toContain("4060");
    expect(r!.currentPrice).toBeCloseTo(1799.9, 1);
    expect(r!.regularPrice).toBeCloseTo(2199, 0);
    expect(r!.categorySlug).toBe("gpu");
    expect(r!.coupon).toContain("KABUM50");
  }, 200_000);

  it("entende abreviacao de milhar", async () => {
    const r = await extrairPromocao(
      "Ryzen 7 5700X por 1,1k na Terabyte, menor preco do ano",
    );
    expect(r).not.toBeNull();
    // 1,1k = 1100, nao 1.1
    expect(r!.currentPrice).toBeGreaterThan(900);
    expect(r!.currentPrice).toBeLessThan(1300);
  }, 200_000);

  it("descarta mensagem que nao e oferta", async () => {
    expect(await extrairPromocao("bom dia pessoal, alguem sabe se vale a pena?")).toBeNull();
  }, 200_000);

  it("descarta oferta que nao e de informatica", async () => {
    // Grupo de promocao mistura tudo. Perfume nao pode virar peca no estoque.
    expect(
      await extrairPromocao("Perfume Malbec 100ml de R$ 300 por R$ 189 no Boticario"),
    ).toBeNull();
  }, 200_000);

  it("descarta oferta sem preco legivel", async () => {
    // Sem preco nao existe promocao. Registrar com zero criaria uma oferta
    // que a avaliacao trataria como boa demais.
    expect(
      await extrairPromocao("SSD NVMe 1TB com desconto absurdo hoje na Amazon, corram!"),
    ).toBeNull();
  }, 200_000);

  it("nao inventa preco anterior quando a mensagem nao diz", async () => {
    const r = await extrairPromocao("Fonte Corsair CV650 por R$ 329 na Pichau");
    expect(r).not.toBeNull();
    expect(r!.regularPrice).toBeUndefined();
  }, 200_000);
});
