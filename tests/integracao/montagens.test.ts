import { describe, expect, it } from "vitest";

import { montarPainelDeSugestoes } from "@/server/services/build.service";

/**
 * Sugestoes contra o estoque real do seed.
 *
 * Os testes de dominio provam a regra com pecas inventadas. Este prova que a
 * regra continua valendo quando ligada ao banco: specs vindas de JSONB,
 * categorias vindas do catalogo, unidades com status de verdade.
 */
describe("montagens a partir do estoque real", () => {
  it("sugere ao menos uma montagem e nunca reutiliza uma peca", async () => {
    const painel = await montarPainelDeSugestoes(8);

    console.log(
      "sugestoes:",
      painel.sugestoes.map((s) => ({
        nivel: s.nivel,
        compat: s.compatibilidade.nivel,
        cpu: s.montagem.cpu?.nome,
        gpu: s.montagem.gpu?.nome,
        psu: s.montagem.psu?.nome,
        watts: s.compatibilidade.consumoEstimadoW,
        faltando: s.compatibilidade.pecasFaltando,
      })),
    );
    console.log("gargalos:", painel.gargalos);

    expect(painel.sugestoes.length).toBeGreaterThan(0);

    const usados = new Set<string>();
    for (const sugestao of painel.sugestoes) {
      const pecas = [
        sugestao.montagem.cpu,
        sugestao.montagem.motherboard,
        sugestao.montagem.gpu,
        sugestao.montagem.psu,
        sugestao.montagem.case,
        sugestao.montagem.cooler,
        ...sugestao.montagem.ram,
        ...sugestao.montagem.storage,
      ].filter((p) => p !== undefined);

      for (const peca of pecas) {
        expect(usados.has(peca.id), peca.nome + " reutilizado").toBe(false);
        usados.add(peca.id);
      }
    }
  });

  it("nunca combina sockets diferentes", async () => {
    const painel = await montarPainelDeSugestoes(8);

    for (const sugestao of painel.sugestoes) {
      const socketCpu = sugestao.montagem.cpu?.specs.socket;
      const socketPlaca = sugestao.montagem.motherboard?.specs.socket;
      if (socketCpu && socketPlaca) {
        expect(socketCpu, sugestao.montagem.cpu?.nome).toBe(socketPlaca);
      }
    }
  });

  it("toda sugestao aprovada tem energia suficiente", async () => {
    const painel = await montarPainelDeSugestoes(8);

    for (const sugestao of painel.sugestoes) {
      if (sugestao.compatibilidade.nivel !== "COMPATIBLE") continue;
      const potencia = sugestao.montagem.psu?.specs.wattage;
      expect(typeof potencia).toBe("number");
      expect(potencia as number).toBeGreaterThanOrEqual(
        sugestao.compatibilidade.consumoEstimadoW,
      );
    }
  });
});
