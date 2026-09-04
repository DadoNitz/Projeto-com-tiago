// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Topbar } from "@/components/layout/topbar";

/**
 * Menu de perfil.
 *
 * Existe por causa de um erro real: o cabecalho do menu usava
 * `DropdownMenuLabel`, que e um `Menu.GroupLabel` do Base UI e LANCA excecao
 * sem um `<Menu.Group>` acima. Como o conteudo do menu so e montado ao abrir,
 * a excecao aparecia no clique e derrubava o menu junto com o botao de sair.
 *
 * O teste de fumaca nao pegava: ele confere o status HTTP das paginas, e a
 * falha era no cliente, dentro de um menu fechado. So abrir o menu de verdade
 * revela esse tipo de defeito.
 */

// A limpeza automatica do Testing Library so e registrada com `globals: true`,
// que esta desligado nesta suite. Sem isto, um teste enxerga o DOM do anterior.
afterEach(cleanup);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard",
}));

vi.mock("@/server/actions/auth.actions", () => ({
  encerrarSessao: vi.fn().mockResolvedValue(undefined),
}));

describe("menu de perfil", () => {
  it("abre sem quebrar e mostra o botao de sair", async () => {
    const usuario = userEvent.setup();
    render(<Topbar nome="Dado Nitz" role="ADMIN" />);

    await usuario.click(screen.getByRole("button", { name: /menu do usuário/i }));

    // O nome e o perfil aparecem no cabecalho do menu.
    expect(await screen.findByText("Dado Nitz")).toBeDefined();
    expect(screen.getByText("Administrador")).toBeDefined();

    // E, principalmente, a saida existe e e clicavel.
    expect(screen.getByText("Sair")).toBeDefined();
  });

  it("chama o encerramento de sessao ao clicar em Sair", async () => {
    const { encerrarSessao } = await import("@/server/actions/auth.actions");
    const usuario = userEvent.setup();

    render(<Topbar nome="Tiago" role="EMPLOYEE" />);
    await usuario.click(screen.getByRole("button", { name: /menu do usuário/i }));
    await usuario.click(await screen.findByText("Sair"));

    expect(encerrarSessao).toHaveBeenCalled();
  });

  it("mostra as iniciais de quem esta logado", () => {
    render(<Topbar nome="Dado Nitz" role="ADMIN" />);
    expect(screen.getByText("DN")).toBeDefined();
  });
});
