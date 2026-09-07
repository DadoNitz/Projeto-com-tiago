import { describe, expect, it } from "vitest";

import { escolherMelhor, pontuar } from "./casar-produto";

/**
 * O risco desta função não é deixar de achar: é achar errado.
 *
 * Comparar o preço de uma placa de vídeo com o de um PC inteiro que a contém
 * produziria uma nota alta e falsa — e nota falsa é pior que nota nenhuma,
 * porque leva a comprar.
 */

describe("casamento correto", () => {
  it("mesma peça, com a loja escrevendo mais detalhe", () => {
    expect(
      pontuar(
        "RTX 4060 Ventus 2X",
        "Placa de Video MSI RTX 4060 Ventus 2X OC 8GB GDDR6",
      ),
    ).toBeGreaterThan(0);
  });

  it("processador com o modelo escrito igual", () => {
    expect(pontuar("Ryzen 5 5600", "Processador AMD Ryzen 5 5600")).toBeGreaterThan(
      0,
    );
  });
});

describe("recusas que protegem a nota", () => {
  it("PC inteiro que contém a peça procurada", () => {
    // O caso que motivou a função: cobertura alta, ruído altíssimo.
    expect(
      pontuar(
        "RTX 4060",
        "PC Gamer Ryzen 5 5500, RTX 4060, 16GB DDR4, SSD NVMe 500GB, 600W",
      ),
    ).toBe(0);
  });

  it("modelo vizinho de prateleira", () => {
    // 4060 e 4060 Ti são peças e preços diferentes.
    expect(pontuar("RTX 4060 Ti 16GB", "Placa de Video RTX 4060 8GB")).toBe(0);
  });

  it("mesma família, geração diferente", () => {
    expect(pontuar("Ryzen 5 5600", "Processador AMD Ryzen 5 3600")).toBe(0);
  });

  it("marca diferente com ficha técnica igual", () => {
    // Caso real: a busca da Kabum devolveu o AOC para uma oferta de Philips.
    // Todos os números batiam — polegadas, taxa de atualização — e o preço
    // comparado seria de outro monitor.
    expect(
      pontuar(
        "Monitor Gamer Phillips 23.8 Full HD IPS 200Hz",
        'Monitor Gamer AOC 23.8", Full HD, 200Hz, 0.3ms, IPS',
      ),
    ).toBe(0);
  });

  it("candidato sem marca declarada não é recusado por isso", () => {
    // Nome vindo de slug de URL costuma vir sem marca; ausência não é
    // contradição.
    expect(
      pontuar("SSD Kingston NV2 1TB", "ssd nv2 1tb m 2 2280 pcie nvme"),
    ).toBeGreaterThan(0);
  });

  it("capacidade diferente", () => {
    expect(pontuar("SSD Kingston NV2 1TB", "SSD Kingston NV2 500GB")).toBe(0);
  });
});

describe("escolha entre candidatos", () => {
  it("prefere o mais específico e ignora o PC montado", () => {
    const melhor = escolherMelhor("RTX 4060 8GB", [
      { nome: "PC Gamer Ryzen 5 5500 RTX 4060 8GB 16GB SSD 500GB", url: "a", preco: 6545 },
      { nome: "Placa de Video Galax RTX 4060 8GB GDDR6", url: "b", preco: 1799 },
    ]);

    expect(melhor?.candidato.url).toBe("b");
  });

  it("devolve null quando nada convence", () => {
    expect(
      escolherMelhor("Teclado mecânico Redragon Kumara", [
        { nome: "Mouse Logitech G203", url: "a", preco: 99 },
      ]),
    ).toBeNull();
  });
});
