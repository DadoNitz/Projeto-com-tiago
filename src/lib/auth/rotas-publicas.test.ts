import { readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { authConfig } from "./config";

/**
 * Quem passa sem sessão.
 *
 * Este arquivo existe por causa de um defeito real: a lista de rotas públicas
 * nomeava `/api/cron/alertas` uma a uma, e a rota de coleta de promoções
 * entrou sem ser adicionada. Em produção ela respondia 307 para o login — o
 * agendamento "rodava" todo dia e não fazia nada, sem erro em lugar nenhum.
 *
 * O sintoma ("o bot não traz ofertas") não aponta para a causa (autorização),
 * e é por isso que este teste lê o disco em vez de repetir uma lista: rota
 * nova de cron entra no teste sozinha.
 */

/** Decide como o proxy decidiria, para um pedido sem sessão. */
function liberadaSemSessao(pathname: string): boolean {
  const autorizado = authConfig.callbacks?.authorized;
  if (!autorizado) throw new Error("authConfig sem callback `authorized`.");

  return Boolean(
    autorizado({
      auth: null,
      request: { nextUrl: new URL(`https://exemplo.test${pathname}`) },
      // O callback só usa `auth` e `request.nextUrl`; o resto do tipo do
      // Auth.js não participa da decisão.
    } as never),
  );
}

/** As rotas de cron que existem de fato, lidas da árvore de arquivos. */
function rotasDeCron(): string[] {
  const raiz = path.resolve("src/app/api/cron");
  return readdirSync(raiz, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => `/api/cron/${entrada.name}`);
}

describe("rotas de agendamento", () => {
  it("existe pelo menos uma, senão o teste não estaria provando nada", () => {
    expect(rotasDeCron().length).toBeGreaterThan(0);
  });

  it.each(rotasDeCron())("%s passa sem sessão", (rota) => {
    // O agendador da Vercel não tem cookie de sessão. Barrado aqui, o cron
    // recebe o HTML do login e falha em silêncio.
    expect(liberadaSemSessao(rota)).toBe(true);
  });

  it("cada rota de cron exige CRON_SECRET no próprio arquivo", async () => {
    // Contrapartida de liberar o prefixo inteiro: se o proxy não protege
    // mais essas rotas, cada uma precisa se proteger sozinha. Sem isso,
    // liberar o prefixo teria transformado cron em gatilho público.
    const { readFileSync } = await import("node:fs");

    for (const rota of rotasDeCron()) {
      const arquivo = path.resolve(
        `src/app/api/cron/${rota.split("/").pop()}/route.ts`,
      );
      const codigo = readFileSync(arquivo, "utf-8");

      expect(codigo, `${rota} não lê CRON_SECRET`).toContain("CRON_SECRET");
      // Segredo ausente tem de desativar a rota, não abri-la: uma variável
      // perdida numa migração de ambiente não pode virar porta aberta.
      expect(codigo, `${rota} não recusa quando o segredo falta`).toMatch(
        /if \(!segredo\)/,
      );
    }
  });
});

describe("rotas privadas continuam privadas", () => {
  it.each([
    "/dashboard",
    "/estoque/itens",
    "/promocoes",
    "/configuracoes/usuarios",
    "/api/uploads",
  ])("%s exige sessão", (rota) => {
    expect(liberadaSemSessao(rota)).toBe(false);
  });

  it("não libera rota que apenas começa parecido com /api/cron", () => {
    // `startsWith("/api/cron/")` com a barra final: sem ela, um futuro
    // `/api/cronometro` entraria de carona.
    expect(liberadaSemSessao("/api/cronometro")).toBe(false);
  });
});
