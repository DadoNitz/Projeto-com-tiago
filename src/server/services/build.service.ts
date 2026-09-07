import "server-only";

import {
  identificarGargalos,
  sugerirMontagens,
  type EstoqueParaMontagem,
  type Gargalo,
  type MontagemSugerida,
} from "@/domain/compatibility/suggester";
import type { Componente } from "@/domain/compatibility/types";
import type { SpecRecord } from "@/domain/specs/types";
import { prisma } from "@/server/db/client";

import { carregarVerificacoes } from "./verification.service";

/**
 * "Montar com meu estoque" (seção 6).
 *
 * Este serviço só faz duas coisas: carregar as peças disponíveis e entregá-las
 * ao motor determinístico. Toda a decisão de compatibilidade acontece em
 * `src/domain/compatibility`, sem banco e sem IA — que é o que permite testá-la
 * exaustivamente.
 */

/** Categorias que entram numa montagem, na ordem dos papéis. */
const SLUGS_DE_MONTAGEM = [
  "cpu",
  "motherboard",
  "ram",
  "gpu",
  "storage",
  "psu",
  "case",
  "cooler",
] as const;

/**
 * Carrega o estoque montável.
 *
 * Só unidades `AVAILABLE`: peça reservada já tem dono, e sugerir uma montagem
 * com ela seria prometer o que não se pode entregar.
 */
export async function carregarEstoqueParaMontagem(): Promise<{
  estoque: EstoqueParaMontagem;
  precoPorUnidade: Map<string, number>;
}> {
  const unidades = await prisma.inventoryUnit.findMany({
    where: {
      status: "AVAILABLE",
      product: { is: { category: { is: { slug: { in: [...SLUGS_DE_MONTAGEM] } } } } },
    },
    select: {
      id: true,
      internalCode: true,
      estimatedSalePrice: true,
      purchaseCost: true,
      product: {
        select: {
          name: true,
          specs: true,
          brand: { select: { name: true } },
          category: { select: { slug: true } },
        },
      },
    },
  });

  const estoque: EstoqueParaMontagem = {
    cpus: [],
    motherboards: [],
    rams: [],
    gpus: [],
    storages: [],
    psus: [],
    cases: [],
    coolers: [],
  };

  const precoPorUnidade = new Map<string, number>();

  const destino: Record<string, Componente[]> = {
    cpu: estoque.cpus,
    motherboard: estoque.motherboards,
    ram: estoque.rams,
    gpu: estoque.gpus,
    storage: estoque.storages,
    psu: estoque.psus,
    case: estoque.cases,
    cooler: estoque.coolers,
  };

  for (const unidade of unidades) {
    const slug = unidade.product.category.slug;
    const lista = destino[slug];
    if (!lista) continue;

    const marca = unidade.product.brand?.name;

    lista.push({
      // O id é o da UNIDADE, não do produto: a montagem consome uma peça
      // física específica, e é ela que será reservada.
      id: unidade.id,
      nome: marca ? `${marca} ${unidade.product.name}` : unidade.product.name,
      categorySlug: slug,
      specs: (unidade.product.specs ?? {}) as SpecRecord,
    });

    precoPorUnidade.set(
      unidade.id,
      Number(unidade.estimatedSalePrice ?? unidade.purchaseCost ?? 0),
    );
  }

  return { estoque, precoPorUnidade };
}

export interface SugestaoComValores extends MontagemSugerida {
  /** Soma do valor estimado de venda das peças usadas. */
  valorDasPecas: number;
  /** Quantas peças a montagem consome. */
  totalDePecas: number;
}

export interface PainelDeMontagens {
  sugestoes: SugestaoComValores[];
  gargalos: Gargalo[];
  /** Quantas peças disponíveis existem em cada papel. */
  disponibilidade: { papel: string; total: number }[];
}

export async function montarPainelDeSugestoes(
  maximo = 8,
): Promise<PainelDeMontagens> {
  const [{ estoque, precoPorUnidade }, verificacoes] = await Promise.all([
    carregarEstoqueParaMontagem(),
    carregarVerificacoes(),
  ]);

  const sugestoes = sugerirMontagens(estoque, {
    maximo,
    verificacoes,
    // Montagens reprovadas também aparecem: saber que a RTX 3060 não cabe no
    // gabinete disponível é informação útil, não ruído.
    incluirIncompativeis: true,
  });

  const comValores: SugestaoComValores[] = sugestoes.map((sugestao) => {
    const pecas = [
      sugestao.montagem.cpu,
      sugestao.montagem.motherboard,
      sugestao.montagem.gpu,
      sugestao.montagem.psu,
      sugestao.montagem.case,
      sugestao.montagem.cooler,
      ...sugestao.montagem.ram,
      ...sugestao.montagem.storage,
    ].filter((peca): peca is Componente => Boolean(peca));

    return {
      ...sugestao,
      valorDasPecas: pecas.reduce(
        (soma, peca) => soma + (precoPorUnidade.get(peca.id) ?? 0),
        0,
      ),
      totalDePecas: pecas.length,
    };
  });

  return {
    sugestoes: comValores,
    gargalos: identificarGargalos(estoque),
    disponibilidade: [
      { papel: "Processadores", total: estoque.cpus.length },
      { papel: "Placas-mãe", total: estoque.motherboards.length },
      { papel: "Memórias", total: estoque.rams.length },
      { papel: "Placas de vídeo", total: estoque.gpus.length },
      { papel: "Armazenamento", total: estoque.storages.length },
      { papel: "Fontes", total: estoque.psus.length },
      { papel: "Gabinetes", total: estoque.cases.length },
      { papel: "Coolers", total: estoque.coolers.length },
    ],
  };
}

/** Uma peça disponível, do jeito que a tela de montagem manual precisa. */
export interface PecaParaMontar {
  id: string;
  codigo: string;
  nome: string;
  categorySlug: string;
  specs: SpecRecord;
  custo: number | null;
  precoSugerido: number | null;
  local: string | null;
}

/**
 * Lista as peças disponíveis para montar escolhendo à mão.
 *
 * Difere de `carregarEstoqueParaMontagem` em dois pontos que importam:
 *
 * - devolve lista plana com código interno, custo e localização, porque quem
 *   monta na bancada procura pela etiqueta e pela prateleira, não pelo id;
 * - inclui TODAS as categorias, não só as oito que o motor sabe avaliar.
 *   Um PC montado leva monitor, teclado, cabo — e uma montagem que não
 *   consegue registrar o que realmente saiu do estoque deixa o estoque
 *   mentindo, que é pior do que não avaliar a compatibilidade daquela peça.
 *
 * Só `AVAILABLE`: peça já reservada para outra montagem não deve aparecer
 * como se estivesse livre.
 */
export async function listarPecasParaMontar(): Promise<PecaParaMontar[]> {
  const unidades = await prisma.inventoryUnit.findMany({
    where: { status: "AVAILABLE", deletedAt: null },
    orderBy: [{ product: { category: { name: "asc" } } }, { entryDate: "desc" }],
    select: {
      id: true,
      internalCode: true,
      purchaseCost: true,
      estimatedSalePrice: true,
      location: { select: { name: true } },
      product: {
        select: {
          name: true,
          specs: true,
          brand: { select: { name: true } },
          category: { select: { slug: true } },
        },
      },
    },
  });

  return unidades.map((unidade) => {
    const marca = unidade.product.brand?.name;
    return {
      // O id e o da UNIDADE: a montagem consome uma peca fisica especifica.
      id: unidade.id,
      codigo: unidade.internalCode,
      nome: marca ? `${marca} ${unidade.product.name}` : unidade.product.name,
      categorySlug: unidade.product.category.slug,
      specs: (unidade.product.specs ?? {}) as SpecRecord,
      custo: unidade.purchaseCost ? Number(unidade.purchaseCost) : null,
      precoSugerido: unidade.estimatedSalePrice
        ? Number(unidade.estimatedSalePrice)
        : null,
      local: unidade.location?.name ?? null,
    };
  });
}
