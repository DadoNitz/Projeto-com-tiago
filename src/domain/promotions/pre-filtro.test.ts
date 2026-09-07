import { describe, expect, it } from "vitest";

import { valeChamarIA } from "./pre-filtro";

/**
 * Filtro que decide se vale gastar uma chamada de IA.
 *
 * Existe porque a cota do plano gratuito é o recurso escasso: chamar o modelo
 * em cada mensagem de um grupo de promoções esgota a cota em minutos, e a
 * maioria das mensagens não é oferta.
 *
 * O viés é deliberado: na dúvida, deixa passar. O custo de um falso positivo é
 * uma chamada de IA; o de um falso negativo é perder uma oferta boa em
 * silêncio.
 */

describe("mensagens que devem passar", () => {
  it("oferta típica de grupo, com emoji e preço no PIX", () => {
    expect(
      valeChamarIA(`🔥 RTX 4060 VENTUS 2X
De R$ 2.199 por R$ 1.799,90 no PIX
https://kabum.com.br/x`).vale,
    ).toBe(true);
  });

  it("preço escrito em milhar abreviado", () => {
    expect(valeChamarIA("Ryzen 7 5700X por 1,1k na Terabyte").vale).toBe(true);
  });

  it("preço sem cifrão", () => {
    expect(valeChamarIA("SSD NVMe Kingston 1TB saindo por 329 reais").vale).toBe(
      true,
    );
  });

  it("produto de informática cujo nome não está na lista de termos", () => {
    // O filtro não conhece toda peça do mercado. Com preço e sem sinal de
    // outra categoria, a decisão fica com a IA — perder oferta boa é pior que
    // gastar uma chamada.
    expect(valeChamarIA("Capturadora Elgato HD60 por R$ 899 na Amazon").vale).toBe(
      true,
    );
  });

  it("mensagem que mistura outra categoria COM hardware", () => {
    // "perfume" aparece, mas "RTX" também. Barrar aqui perderia a oferta.
    expect(
      valeChamarIA("Combo: perfume Malbec R$ 189 e RTX 3060 por R$ 1.299").vale,
    ).toBe(true);
  });
});

describe("mensagens que devem ser descartadas de graça", () => {
  it("conversa comum", () => {
    const r = valeChamarIA("bom dia pessoal, alguém sabe se vale a pena?");
    expect(r.vale).toBe(false);
    expect(r.motivo).toBe("sem-preco");
  });

  it("mensagem curta", () => {
    expect(valeChamarIA("valeu!").vale).toBe(false);
  });

  it("oferta de outra categoria", () => {
    const r = valeChamarIA(
      "Air fryer Mondial 4L de R$ 499 por R$ 299 no Magazine Luiza",
    );
    expect(r.vale).toBe(false);
    expect(r.motivo).toBe("outra-categoria");
  });

  it("anúncio de hardware sem preço nenhum", () => {
    const r = valeChamarIA(
      "SSD NVMe com desconto absurdo hoje na Amazon, corram gente!",
    );
    expect(r.vale).toBe(false);
    expect(r.motivo).toBe("sem-preco");
  });

  it("aviso do grupo", () => {
    expect(
      valeChamarIA("Pessoal, leiam as regras do grupo antes de postar").vale,
    ).toBe(false);
  });
});

describe("economia real", () => {
  it("descarta a maior parte de um lote típico de grupo", () => {
    // O número importa: é ele que decide se a cota gratuita aguenta.
    const lote = [
      "bom dia",
      "alguém já comprou dessa loja?",
      "kkkkk",
      "obrigado!",
      "Pessoal, leiam as regras do grupo",
      "Air fryer Mondial 4L por R$ 299",
      "Perfume Malbec 100ml por R$ 189",
      "Tênis Nike por R$ 249 no site",
      "vale a pena essa fonte?",
      "🔥 RTX 4060 por R$ 1.799 na Kabum",
      "Ryzen 5 5600 a R$ 699 na Pichau",
      "SSD Kingston NV2 1TB por 329 reais",
    ];

    const passaram = lote.filter((m) => valeChamarIA(m).vale);

    // As três ofertas de hardware passam; o resto é descartado sem custo.
    expect(passaram).toHaveLength(3);
    expect(passaram.every((m) => /rtx|ryzen|ssd/i.test(m))).toBe(true);
  });
});
