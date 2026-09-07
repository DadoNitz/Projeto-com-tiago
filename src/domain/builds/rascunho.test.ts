import { describe, expect, it } from "vitest";

import { conferirRascunho } from "./rascunho";

/**
 * A seleção guardada precisa ser conferida ao voltar.
 *
 * Nada é reservado no estoque enquanto a montagem não é salva: entre sair da
 * tela e voltar, outra pessoa pode ter vendido a peça. Restaurar sem conferir
 * mostraria como escolhida uma peça que não está mais lá — e a montagem sairia
 * diferente do que a pessoa pensava estar montando, sem nenhum aviso.
 */

const DISPONIVEIS = new Set(["u1", "u2", "u3"]);

describe("conferência contra o estoque de agora", () => {
  it("mantém o que continua disponível", () => {
    const r = conferirRascunho(["u1", "u3"], DISPONIVEIS);

    expect(r.validos).toEqual(["u1", "u3"]);
    expect(r.perdidas).toBe(0);
  });

  it("descarta a peça que saiu, e diz quantas foram", () => {
    // "u9" foi vendida enquanto a pessoa estava fora. Sumir calado é o
    // comportamento errado: o número é o que permite avisar.
    const r = conferirRascunho(["u1", "u9", "u2"], DISPONIVEIS);

    expect(r.validos).toEqual(["u1", "u2"]);
    expect(r.perdidas).toBe(1);
  });

  it("descarta tudo quando o estoque inteiro mudou", () => {
    const r = conferirRascunho(["u7", "u8"], DISPONIVEIS);

    expect(r.validos).toEqual([]);
    expect(r.perdidas).toBe(2);
  });

  it("não conta a mesma peça duas vezes", () => {
    // Id repetido viraria peça contada em dobro no custo total e entregue
    // duplicada ao motor de compatibilidade.
    const r = conferirRascunho(["u1", "u1", "u2"], DISPONIVEIS);

    expect(r.validos).toEqual(["u1", "u2"]);
    expect(r.perdidas).toBe(0);
  });
});

describe("conteúdo que não deveria estar lá", () => {
  it("aguenta lixo no lugar da lista", () => {
    // Vem de localStorage: versão antiga do sistema, extensão do navegador,
    // edição manual. Confiar no formato seria confiar em dado de fora.
    for (const entrada of [null, undefined, "abc", 42, {}, { ids: ["u1"] }]) {
      expect(conferirRascunho(entrada, DISPONIVEIS)).toEqual({
        validos: [],
        perdidas: 0,
      });
    }
  });

  it("ignora itens que não são texto dentro da lista", () => {
    const r = conferirRascunho(["u1", 3, null, { id: "u2" }, "u2"], DISPONIVEIS);

    expect(r.validos).toEqual(["u1", "u2"]);
    // Os itens inválidos não são "peças perdidas": nunca foram peças.
    expect(r.perdidas).toBe(0);
  });

  it("lista vazia não avisa nada", () => {
    expect(conferirRascunho([], DISPONIVEIS)).toEqual({
      validos: [],
      perdidas: 0,
    });
  });
});
