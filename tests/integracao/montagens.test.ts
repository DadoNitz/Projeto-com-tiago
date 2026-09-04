import { describe, expect, it } from "vitest";

import { prisma } from "@/server/db/client";
import { montarPainelDeSugestoes } from "@/server/services/build.service";
import {
  carregarVerificacoes,
  registrarVerificacao,
  removerVerificacao,
} from "@/server/services/verification.service";

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

describe("verificacao manual de compatibilidade", () => {
  it("resolve o aviso de BIOS da placa conferida, e so dela", async () => {
    // A B450 do seed avisa que precisa de BIOS atualizada para Ryzen 5000.
    // Sem esse recurso, o aviso reaparece em toda sugestao para sempre.
    const usuario = await prisma.user.findFirstOrThrow({
      where: { role: "ADMIN" },
      select: { id: true, name: true, role: true },
    });
    const ctx = {
      userId: usuario.id,
      role: usuario.role,
      name: usuario.name,
      ip: null,
      userAgent: "vitest",
    };

    const placa = await prisma.inventoryUnit.findFirst({
      where: {
        status: "AVAILABLE",
        product: { is: { name: { contains: "B450" } } },
      },
      select: { id: true },
    });

    if (!placa) return;

    try {
      await registrarVerificacao(
        {
          ruleKey: "bios-placa",
          unitId: placa.id,
          reason: "BIOS conferida na bancada, versao F65",
        },
        ctx,
      );

      const verificacoes = await carregarVerificacoes();
      const chave = `bios-placa::${placa.id}`;
      expect(verificacoes.has(chave)).toBe(true);
      expect(verificacoes.get(chave)?.verificadoPor).toBe(usuario.name);

      // O painel roda o motor com as verificacoes carregadas.
      const painel = await montarPainelDeSugestoes(8);
      for (const sugestao of painel.sugestoes) {
        const bios = sugestao.compatibilidade.checks.find(
          (check) => check.regra === "bios-placa",
        );
        if (bios && sugestao.montagem.motherboard?.id === placa.id) {
          expect(bios.nivel).toBe("COMPATIBLE");
          expect(bios.mensagem).toContain("F65");
        }
      }
    } finally {
      await removerVerificacao({ ruleKey: "bios-placa", unitId: placa.id }, ctx);
      await prisma.$executeRawUnsafe(
        `DELETE FROM "audit_logs" WHERE "entityId" = $1`,
        placa.id,
      );
    }
  });
});
