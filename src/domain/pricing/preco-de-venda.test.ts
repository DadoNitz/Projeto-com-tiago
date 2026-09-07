import { describe, expect, it } from "vitest";

import { sugerirPreco, type VendaAnterior } from "./preco-de-venda";

/**
 * O risco desta função não é sugerir um preço estranho: é sugerir um preço
 * plausível e errado. Quem olha a tela vai confiar no número — então os testes
 * abaixo cobrem os três jeitos de o número sair errado com cara de certo:
 * abaixo do custo, apoiado em histórico que não existe, e sem avisar que os
 * dados eram ruins.
 */

const vendas = (razoes: number[]): VendaAnterior[] =>
  razoes.map((razao) => ({ custo: 1000, preco: 1000 * razao }));

describe("nunca sugere prejuízo", () => {
  it("eleva o alvo quando o preço estimado das peças fica abaixo do custo", () => {
    const sugestao = sugerirPreco(
      [
        { custo: 1000, precoEstimado: 400 },
        { custo: 1000, precoEstimado: 400 },
      ],
      [],
      { montada: true },
    );

    // Custo 2000: o mínimo é 2400, e o alvo não pode ficar embaixo dele.
    expect(sugestao?.minimo).toBe(2400);
    expect(sugestao?.alvo).toBeGreaterThanOrEqual(2400);
    expect(sugestao?.motivos.join(" ")).toContain("margem mínima");
  });

  it("o mínimo fica sempre acima do custo somado", () => {
    const sugestao = sugerirPreco([{ custo: 1533.7, precoEstimado: 2200 }]);

    expect(sugestao?.custo).toBe(1533.7);
    expect(sugestao?.minimo).toBeGreaterThan(1533.7);
  });

  it("o anúncio fica acima do alvo, e o alvo acima do mínimo", () => {
    const sugestao = sugerirPreco(
      [
        { custo: 800, precoEstimado: 1200 },
        { custo: 600, precoEstimado: 900 },
      ],
      [],
      { montada: true },
    );

    expect(sugestao).not.toBeNull();
    expect(sugestao!.anuncio).toBeGreaterThan(sugestao!.alvo);
    expect(sugestao!.alvo).toBeGreaterThanOrEqual(sugestao!.minimo);
  });
});

describe("de onde o alvo veio", () => {
  it("usa o histórico quando há vendas suficientes", () => {
    const sugestao = sugerirPreco(
      [{ custo: 2000, precoEstimado: 2200 }],
      vendas([1.5, 1.6, 1.7]),
      { montada: true },
    );

    // Mediana 1,6 sobre custo 2000 — e não a soma das peças, que daria menos.
    expect(sugestao?.base).toBe("historico");
    expect(sugestao?.alvo).toBe(3200);
  });

  it("ignora histórico curto demais para ter mediana confiável", () => {
    const sugestao = sugerirPreco(
      [{ custo: 2000, precoEstimado: 3000 }],
      vendas([1.5, 1.6]),
      { montada: true },
    );

    expect(sugestao?.base).toBe("pecas");
  });

  it("a mediana protege contra uma venda fora da curva", () => {
    const comPechincha = sugerirPreco(
      [{ custo: 1000, precoEstimado: 1200 }],
      vendas([0.4, 1.5, 1.55, 1.6, 1.65]),
      { montada: true },
    );

    // A venda a 0,4 entra na conta mas não decide: a mediana continua 1,55.
    expect(comPechincha?.alvo).toBe(1550);
  });

  it("cai para o custo quando não há preço estimado nem histórico", () => {
    const sugestao = sugerirPreco([{ custo: 1000, precoEstimado: null }], [], {
      montada: true,
    });

    expect(sugestao?.base).toBe("custo");
    expect(sugestao?.confianca).toBe("baixa");
  });

  it("peça avulsa não ganha o prêmio de montagem", () => {
    const peca = sugerirPreco([{ custo: 500, precoEstimado: 1000 }]);
    const montada = sugerirPreco([{ custo: 500, precoEstimado: 1000 }], [], {
      montada: true,
    });

    expect(peca?.alvo).toBe(1000);
    expect(montada!.alvo).toBeGreaterThan(peca!.alvo);
  });
});

describe("a confiança acompanha a qualidade do dado", () => {
  it("alta quando todas as peças têm preço e há histórico", () => {
    const sugestao = sugerirPreco(
      [
        { custo: 900, precoEstimado: 1300 },
        { custo: 700, precoEstimado: 1000 },
      ],
      vendas([1.4, 1.45, 1.5]),
      { montada: true },
    );

    expect(sugestao?.confianca).toBe("alta");
  });

  it("baixa quando a maioria das peças não tem preço estimado", () => {
    const sugestao = sugerirPreco(
      [
        { custo: 900, precoEstimado: 1300 },
        { custo: 700, precoEstimado: null },
        { custo: 300, precoEstimado: null },
      ],
      [],
      { montada: true },
    );

    expect(sugestao?.confianca).toBe("baixa");
    expect(sugestao?.motivos.join(" ")).toContain("2 peças");
  });

  it("baixa quando nenhuma peça tem custo cadastrado", () => {
    const sugestao = sugerirPreco(
      [{ custo: null, precoEstimado: 1200 }],
      vendas([1.4, 1.45, 1.5]),
    );

    expect(sugestao?.custo).toBe(0);
    expect(sugestao?.confianca).toBe("baixa");
    expect(sugestao?.motivos.join(" ")).toContain("não há piso");
  });
});

describe("recusa em vez de inventar", () => {
  it("sem peças, não há sugestão", () => {
    expect(sugerirPreco([])).toBeNull();
  });

  it("peças sem custo e sem preço não produzem número", () => {
    expect(
      sugerirPreco([
        { custo: null, precoEstimado: null },
        { custo: 0, precoEstimado: 0 },
      ]),
    ).toBeNull();
  });
});
