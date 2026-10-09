import { describe, expect, it } from "vitest";

import {
  anuncioRelevante,
  montarConsulta,
  resumirPrecos,
} from "./preco-de-referencia";

describe("montarConsulta", () => {
  it("tira anotação entre parênteses e palavras de categoria", () => {
    expect(montarConsulta("Placa-mãe Bluecase LGA1155 (c/ slot NVMe)")).toBe(
      "bluecase lga1155",
    );
    expect(montarConsulta("Memória ADATA DDR4 8GB 3200MHz")).toBe(
      "adata ddr4 8gb 3200mhz",
    );
  });

  it("dá contexto à fonte genérica", () => {
    expect(montarConsulta("Fonte genérica 500W chaveada", "psu")).toBe(
      "fonte 500w chaveada",
    );
  });
});

describe("anuncioRelevante", () => {
  it("aceita a mesma peça escrita de outro jeito", () => {
    expect(anuncioRelevante("rx 580 8gb", "Placa de Vídeo RX580 8GB GDDR5")).toBe(true);
  });

  it("recusa PC inteiro que contém a peça", () => {
    expect(anuncioRelevante("rx 580 8gb", "PC Gamer Ryzen 5 RX 580 8GB")).toBe(false);
  });

  it("recusa peça com defeito", () => {
    expect(anuncioRelevante("rx 580 8gb", "RX 580 8GB com defeito")).toBe(false);
  });

  it("exige o número do modelo no estrito", () => {
    expect(anuncioRelevante("rx 580 8gb", "Placa de Vídeo RX 570 8GB")).toBe(false);
    expect(anuncioRelevante("rx 580 2048sp 8gb", "RX 580 8GB")).toBe(false);
  });

  it("no aproximado, basta o modelo principal", () => {
    expect(anuncioRelevante("rx 580 2048sp 8gb", "RX 580 8GB", "aproximado")).toBe(true);
  });
});

describe("resumirPrecos", () => {
  it("sem preço válido, não inventa referência", () => {
    expect(resumirPrecos([])).toBeNull();
    expect(resumirPrecos([0, -10, Number.NaN])).toBeNull();
  });

  it("descarta extremos antes da média", () => {
    const resumo = resumirPrecos([15, 450, 480, 500, 520, 6000]);
    expect(resumo).toMatchObject({ amostras: 4, minimo: 450, maximo: 520 });
    expect(resumo!.media).toBe(488);
  });

  it("com muitos preços, corta 10% de cada ponta", () => {
    const precos = [400, 410, 420, 430, 440, 450, 460, 470, 480, 490];
    const resumo = resumirPrecos(precos)!;
    expect(resumo.amostras).toBe(8);
    expect(resumo.minimo).toBe(410);
    expect(resumo.maximo).toBe(480);
  });
});
