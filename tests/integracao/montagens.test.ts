import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/client";
import { montarPainelDeSugestoes } from "@/server/services/build.service";
import { cadastrarPecaComUnidades } from "@/server/services/product.service";
import {
  carregarVerificacoes,
  registrarVerificacao,
  removerVerificacao,
} from "@/server/services/verification.service";
import type { ActionContext } from "@/server/session";

/**
 * Sugestões de montagem ligadas ao banco.
 *
 * Os testes de domínio provam a regra com peças inventadas em memória. Este
 * prova que ela continua valendo com specs vindas de JSONB, categorias vindas
 * do catálogo e unidades com status de verdade.
 *
 * O teste **cria o próprio estoque** e o remove no fim. A versão anterior
 * dependia dos dados de demonstração estarem no banco — e passou a falhar no
 * dia em que o estoque foi limpo para uso real. Teste que depende do que por
 * acaso está no banco não prova nada: ele mede o banco, não o código.
 */

const MARCADOR = "__teste_montagem__";

let ctx: ActionContext;

beforeAll(async () => {
  const usuario = await prisma.user.findFirstOrThrow({
    where: { role: "ADMIN", active: true },
    select: { id: true, name: true, role: true },
  });
  ctx = {
    userId: usuario.id,
    role: usuario.role,
    name: usuario.name,
    ip: null,
    userAgent: "vitest",
  };

  await montarEstoqueDeTeste();
});

afterAll(async () => {
  const produtos = await prisma.product.findMany({
    where: { name: { startsWith: MARCADOR } },
    select: { id: true },
  });
  const ids = produtos.map((p) => p.id);
  if (ids.length === 0) return;

  const unidades = await prisma.inventoryUnit.findMany({
    where: { productId: { in: ids } },
    select: { id: true },
  });
  const unidadeIds = unidades.map((u) => u.id);

  await prisma.$executeRawUnsafe(
    `DELETE FROM "compatibility_overrides" WHERE "subjectId" = ANY($1::text[])`,
    unidadeIds,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "inventory_movements" WHERE "productId" = ANY($1::text[])`,
    ids,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "audit_logs" WHERE "entityId" = ANY($1::text[])`,
    [...ids, ...unidadeIds],
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "inventory_units" WHERE "productId" = ANY($1::text[])`,
    ids,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "products" WHERE id = ANY($1::text[])`,
    ids,
  );
});

async function categoria(slug: string): Promise<string> {
  const registro = await prisma.category.findUniqueOrThrow({
    where: { slug },
    select: { id: true },
  });
  return registro.id;
}

async function cadastrar(
  slug: string,
  nome: string,
  specs: Record<string, unknown>,
  quantidade = 1,
) {
  return cadastrarPecaComUnidades(
    { name: `${MARCADOR} ${nome}`, categoryId: await categoria(slug), trackingMode: "SERIALIZED", lowStockThreshold: 0, tagIds: [], specs },
    { quantidade, seriais: [], condition: "USED", estimatedSalePrice: 100 },
    ctx,
  );
}

/**
 * Estoque mínimo para uma máquina completa, mais uma B450 que dispara o aviso
 * de BIOS — o caso que a verificação manual existe para resolver.
 */
async function montarEstoqueDeTeste() {
  await cadastrar("cpu", "Ryzen 5 5600", {
    socket: "AM4", cores: 6, threads: 12, tdpWatts: 65,
    integratedGraphics: false, generation: "Zen 3",
  });
  await cadastrar("motherboard", "B450M", {
    socket: "AM4", chipset: "B450", formFactor: "Micro-ATX", memoryType: "DDR4",
    ramSlots: 4, maxRamGb: 128, m2Slots: 1, sataPorts: 4,
    biosUpdateNeededFor: "Ryzen 5000",
  });
  await cadastrar("ram", "DDR4 8GB", {
    memoryType: "DDR4", capacityGb: 8, modules: 1, formFactor: "DIMM",
  }, 2);
  await cadastrar("gpu", "RTX 3060", {
    gpuChip: "RTX 3060", vramGb: 12, tdpWatts: 170,
    powerConnectors: ["1x 8 pinos"], lengthMm: 235,
  });
  await cadastrar("storage", "NVMe 500GB", {
    driveType: "SSD", capacityGb: 500, interface: "NVMe PCIe 4.0", formFactor: "M.2 2280",
  });
  await cadastrar("psu", "Fonte 650W", {
    wattage: 650, certification: "80 Plus Bronze", modularity: "Não modular",
    pcieConnectors: ["2x 8 pinos"], formFactor: "ATX",
  });
  await cadastrar("case", "Gabinete ATX", {
    maxMotherboardFormFactor: "ATX", maxGpuLengthMm: 350,
    maxCoolerHeightMm: 165, psuFormFactor: "ATX",
  });
}

describe("montagens a partir do estoque", () => {
  it("sugere ao menos uma montagem e nunca reutiliza uma peça", async () => {
    const painel = await montarPainelDeSugestoes(8);

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
        expect(usados.has(peca.id), `${peca.nome} reutilizado`).toBe(false);
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

  it("toda sugestão aprovada tem energia suficiente", async () => {
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

describe("verificação manual de compatibilidade", () => {
  it("resolve o aviso de BIOS da placa conferida", async () => {
    // A B450 avisa que precisa de BIOS atualizada para Ryzen 5000. Sem esse
    // recurso, o aviso reaparece em toda sugestão, para sempre.
    const placa = await prisma.inventoryUnit.findFirstOrThrow({
      where: {
        status: "AVAILABLE",
        product: { is: { name: { contains: `${MARCADOR} B450M` } } },
      },
      select: { id: true },
    });

    const antes = await montarPainelDeSugestoes(8);
    const avisoAntes = antes.sugestoes
      .flatMap((s) => s.compatibilidade.checks)
      .find((c) => c.regra === "bios-placa");
    expect(avisoAntes?.nivel).toBe("NEEDS_VERIFICATION");

    try {
      await registrarVerificacao(
        {
          ruleKey: "bios-placa",
          unitId: placa.id,
          reason: "BIOS conferida na bancada, versão F65",
        },
        ctx,
      );

      const verificacoes = await carregarVerificacoes();
      expect(verificacoes.has(`bios-placa::${placa.id}`)).toBe(true);
      expect(verificacoes.get(`bios-placa::${placa.id}`)?.verificadoPor).toBe(
        ctx.name,
      );

      const depois = await montarPainelDeSugestoes(8);
      const avisoDepois = depois.sugestoes
        .flatMap((s) => s.compatibilidade.checks)
        .find((c) => c.regra === "bios-placa");

      expect(avisoDepois?.nivel).toBe("COMPATIBLE");
      expect(avisoDepois?.mensagem).toContain("F65");
    } finally {
      await removerVerificacao({ ruleKey: "bios-placa", unitId: placa.id }, ctx);
    }
  });
});
