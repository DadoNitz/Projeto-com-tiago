import { describe, expect, it } from "vitest";

import { camposAlterados } from "./audit-read.service";

/**
 * Comparação entre o antes e o depois de um evento de auditoria.
 *
 * Função pura, testável sem banco. O que ela decide é o que a pessoa vê ao
 * perguntar "o que mudou nesse registro?".
 */
describe("camposAlterados", () => {
  it("lista apenas o que mudou", () => {
    // Mostrar os dois objetos inteiros obrigaria a caçar a diferença no meio
    // de campos iguais — e é justamente a diferença que se veio ver.
    const mudancas = camposAlterados(
      { nome: "RTX 3060", custo: 1100, local: "A3" },
      { nome: "RTX 3060", custo: 1250, local: "A3" },
    );

    expect(mudancas).toHaveLength(1);
    expect(mudancas[0]).toEqual({ campo: "custo", de: "1100", para: "1250" });
  });

  it("mostra campo que passou a existir e campo que sumiu", () => {
    const mudancas = camposAlterados(
      { serial: "ABC123" },
      { origem: "Fornecedor" },
    );

    expect(mudancas).toEqual([
      { campo: "origem", de: "—", para: "Fornecedor" },
      { campo: "serial", de: "ABC123", para: "—" },
    ]);
  });

  it("trata nulo e ausente como o mesmo travessão", () => {
    // Um campo que era null e virou undefined não mudou nada para quem lê.
    expect(camposAlterados({ notas: null }, {})).toEqual([]);
  });

  it("traduz booleano em vez de mostrar true/false", () => {
    const mudancas = camposAlterados({ ativo: false }, { ativo: true });
    expect(mudancas[0]).toEqual({ campo: "ativo", de: "não", para: "sim" });
  });

  it("formata lista de forma legível", () => {
    const mudancas = camposAlterados(
      { conectores: ["1x 8 pinos"] },
      { conectores: ["1x 8 pinos", "1x 6 pinos"] },
    );
    expect(mudancas[0]?.para).toBe("1x 8 pinos, 1x 6 pinos");
  });

  it("lista vazia aparece como travessão, não como colchetes", () => {
    const mudancas = camposAlterados({ tags: ["gamer"] }, { tags: [] });
    expect(mudancas[0]?.para).toBe("—");
  });

  it("não quebra com entrada nula", () => {
    // Eventos de criação não têm "antes"; a tela chama a função do mesmo jeito.
    expect(camposAlterados(null, { nome: "Novo" })).toEqual([
      { campo: "nome", de: "—", para: "Novo" },
    ]);
    expect(camposAlterados(undefined, undefined)).toEqual([]);
  });

  it("ordena por nome do campo, para a leitura ficar estável", () => {
    const mudancas = camposAlterados(
      { zebra: 1, alfa: 1 },
      { zebra: 2, alfa: 2 },
    );
    expect(mudancas.map((m) => m.campo)).toEqual(["alfa", "zebra"]);
  });
});
