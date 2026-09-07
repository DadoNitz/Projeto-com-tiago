import { describe, expect, it } from "vitest";

import { linkDaPagina } from "./paginacao";

describe("linkDaPagina", () => {
  it("preserva filtros repetidos ao avançar de página", () => {
    // O caso que estava quebrado: duas situações marcadas chegam como array,
    // e a montagem antiga descartava tudo que não fosse texto.
    const link = linkDaPagina(
      "/estoque/itens",
      { status: ["AVAILABLE", "RESERVED"], q: "ddr4" },
      "abc",
    );

    const busca = new URLSearchParams(link.split("?")[1]);
    expect(busca.getAll("status")).toEqual(["AVAILABLE", "RESERVED"]);
    expect(busca.get("q")).toBe("ddr4");
    expect(busca.get("cursor")).toBe("abc");
  });

  it("troca o cursor da página atual em vez de acumular", () => {
    const link = linkDaPagina(
      "/estoque/itens",
      { cursor: "antigo", categoryId: "cat-1" },
      "novo",
    );

    const busca = new URLSearchParams(link.split("?")[1]);
    expect(busca.getAll("cursor")).toEqual(["novo"]);
    expect(busca.get("categoryId")).toBe("cat-1");
  });

  it("sem cursor, devolve o link do início da lista mantendo os filtros", () => {
    const link = linkDaPagina(
      "/estoque/itens",
      { cursor: "antigo", status: ["DEFECTIVE"] },
      null,
    );

    expect(link).toBe("/estoque/itens?status=DEFECTIVE");
  });

  it("ignora parâmetros ausentes e dispensa a interrogação quando não sobra nada", () => {
    expect(linkDaPagina("/estoque/movimentacoes", { type: undefined })).toBe(
      "/estoque/movimentacoes",
    );
  });

  it("escapa valores com caractere especial", () => {
    const link = linkDaPagina(
      "/estoque/itens",
      { q: "placa mãe & fonte" },
      null,
    );
    expect(link).toBe("/estoque/itens?q=placa+m%C3%A3e+%26+fonte");
  });
});
