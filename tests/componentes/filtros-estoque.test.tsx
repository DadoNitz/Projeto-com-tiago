// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Filtros } from "@/app/(app)/estoque/itens/filtros";

const mock = vi.hoisted(() => ({
  push: vi.fn(),
  params: "q=Ryzen&cursor=pagina2&precoMin=0",
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mock.push }),
  useSearchParams: () => new URLSearchParams(mock.params),
}));
afterEach(() => {
  cleanup();
  mock.push.mockClear();
});

describe("filtros do estoque", () => {
  it("permite combinar filtros antes de aplicar e preserva busca removendo cursor", async () => {
    const user = userEvent.setup();
    render(
      <Filtros
        categorias={[{ id: "cpu", name: "Processador" }]}
        marcas={[]}
        locais={[]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Filtros/ }));
    const dialog = within(screen.getByRole("dialog"));
    await user.click(dialog.getByRole("checkbox", { name: "Disponível" }));
    await user.click(dialog.getByRole("checkbox", { name: "Reservada" }));
    await user.selectOptions(dialog.getByLabelText("Categoria"), "cpu");
    expect(mock.push).not.toHaveBeenCalled();
    await user.click(dialog.getByRole("button", { name: "Aplicar filtros" }));
    const url = new URL(mock.push.mock.calls[0]![0], "http://localhost");
    expect(url.searchParams.getAll("status")).toEqual([
      "AVAILABLE",
      "RESERVED",
    ]);
    expect(url.searchParams.get("categoryId")).toBe("cpu");
    expect(url.searchParams.get("q")).toBe("Ryzen");
    expect(url.searchParams.get("precoMin")).toBe("0");
    expect(url.searchParams.has("cursor")).toBe(false);
  });
  it("limpa os filtros pela URL e permite remover mínimo zero", async () => {
    const user = userEvent.setup();
    render(<Filtros categorias={[]} marcas={[]} locais={[]} />);
    await user.click(
      screen.getByRole("button", { name: "Remover filtro Mín. R$ 0" }),
    );
    expect(mock.push.mock.calls[0]![0]).not.toContain("precoMin");
    await user.click(screen.getByRole("button", { name: "Limpar tudo" }));
    expect(mock.push).toHaveBeenLastCalledWith("/estoque/itens?", {
      scroll: false,
    });
  });
});
