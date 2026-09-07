import "server-only";

import { z } from "zod";

import { aiProvider, iaDisponivel } from "@/lib/ai";
import { prisma } from "@/server/db/client";
import { formatarMoeda } from "@/lib/format";
import type { Ator } from "@/server/ator";

import { registrarAuditoria } from "./audit.service";
import { NaoEncontradoError } from "./errors";

/**
 * Promoções (seção 15).
 *
 * Cadastro manual, sem scraping. A especificação pede explicitamente para não
 * depender de raspagem de sites, e a decisão é acertada: raspador quebra a
 * cada mudança de layout, costuma violar termos de uso, e o valor real da
 * funcionalidade não está em achar a oferta — está em **julgar se ela presta**.
 *
 * E é aí que este sistema tem uma vantagem que nenhum site de promoção tem:
 * ele sabe quanto você já pagou naquela peça. "R$ 1.290 na RTX 3060" é um
 * número solto; "R$ 1.290 sendo que você comprou duas por R$ 1.100" é uma
 * decisão.
 */

export interface DadosDaPromocao {
  title: string;
  storeSlug?: string | undefined;
  storeName?: string | undefined;
  categorySlug?: string | undefined;
  currentPrice: number;
  regularPrice?: number | undefined;
  url?: string | undefined;
  coupon?: string | undefined;
  cashbackPct?: number | undefined;
  shippingCost?: number | undefined;
}

function slugificar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function registrarPromocao(
  dados: DadosDaPromocao,
  ctx: Ator,
): Promise<{ id: string }> {
  let storeId: string | null = null;

  if (dados.storeName) {
    const slug = dados.storeSlug ?? slugificar(dados.storeName);
    const loja = await prisma.promotionStore.upsert({
      where: { slug },
      create: { slug, name: dados.storeName.trim() },
      update: {},
      select: { id: true },
    });
    storeId = loja.id;
  }

  const desconto =
    dados.regularPrice && dados.regularPrice > dados.currentPrice
      ? ((dados.regularPrice - dados.currentPrice) / dados.regularPrice) * 100
      : null;

  const promocao = await prisma.promotion.create({
    data: {
      title: dados.title.trim(),
      storeId,
      categorySlug: dados.categorySlug ?? null,
      currentPrice: dados.currentPrice,
      regularPrice: dados.regularPrice ?? null,
      discountPct: desconto !== null ? Math.round(desconto * 100) / 100 : null,
      url: dados.url?.trim() || null,
      coupon: dados.coupon?.trim() || null,
      cashbackPct: dados.cashbackPct ?? null,
      shippingCost: dados.shippingCost ?? null,
    },
    select: { id: true },
  });

  // Todo preço observado entra no histórico, inclusive o primeiro. É o que
  // permite responder depois se o "desconto" anunciado era real.
  await prisma.priceHistory.create({
    data: { promotionId: promocao.id, price: dados.currentPrice },
  });

  await registrarAuditoria(
    {
      action: "create",
      entity: "Promotion",
      entityId: promocao.id,
      after: { titulo: dados.title, preco: dados.currentPrice },
    },
    ctx,
  );

  return promocao;
}

export async function listarPromocoes(apenasAtivas = true) {
  return prisma.promotion.findMany({
    where: apenasAtivas ? { active: true } : {},
    orderBy: { seenAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      categorySlug: true,
      currentPrice: true,
      regularPrice: true,
      discountPct: true,
      url: true,
      coupon: true,
      cashbackPct: true,
      shippingCost: true,
      aiScore: true,
      aiVerdict: true,
      seenAt: true,
      active: true,
      store: { select: { name: true } },
    },
  });
}

export async function arquivarPromocao(
  id: string,
  ctx: Ator,
): Promise<void> {
  await prisma.promotion.update({ where: { id }, data: { active: false } });
  await registrarAuditoria(
    { action: "update", entity: "Promotion", entityId: id, after: { active: false } },
    ctx,
  );
}

/**
 * Custo de referência: o que você já pagou em peças parecidas.
 *
 * A busca é por texto no nome do produto, o que é grosseiro mas honesto — e
 * o resultado é sempre mostrado junto com as peças que o sustentam, para que
 * a pessoa julgue se a comparação faz sentido.
 */
async function referenciaDeCusto(titulo: string): Promise<{
  pecas: { nome: string; custo: number; data: string }[];
  custoMedio: number | null;
} | null> {
  // Termos com 4+ caracteres: "3060", "ryzen", "corsair". Palavras curtas
  // trariam ruído demais.
  const termos = titulo
    .split(/\s+/)
    .map((termo) => termo.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((termo) => termo.length >= 4)
    .slice(0, 4);

  if (termos.length === 0) return null;

  const unidades = await prisma.inventoryUnit.findMany({
    where: {
      purchaseCost: { not: null },
      OR: termos.map((termo) => ({
        product: { is: { name: { contains: termo, mode: "insensitive" } } },
      })),
    },
    orderBy: { purchaseDate: "desc" },
    take: 10,
    select: {
      purchaseCost: true,
      entryDate: true,
      product: { select: { name: true } },
    },
  });

  if (unidades.length === 0) return null;

  const pecas = unidades.map((unidade) => ({
    nome: unidade.product.name,
    custo: Number(unidade.purchaseCost ?? 0),
    data: unidade.entryDate.toISOString().slice(0, 10),
  }));

  return {
    pecas,
    custoMedio:
      pecas.reduce((soma, peca) => soma + peca.custo, 0) / pecas.length,
  };
}

const avaliacaoSchema = z.object({
  nota: z.number().min(0).max(10),
  vale: z.boolean(),
  veredito: z.string(),
});

export interface AvaliacaoDaPromocao {
  nota: number;
  vale: boolean;
  veredito: string;
  /** Peças suas que serviram de comparação. */
  referencias: { nome: string; custo: number; data: string }[];
}

const INSTRUCAO = [
  "Você avalia se uma promoção de peça de informática vale a pena para uma",
  "operação que compra para revender ou montar computadores.",
  "",
  "O critério é comercial, não emocional: a pergunta é se comprar por esse",
  "preço deixa margem, e não se o desconto anunciado parece grande.",
  "",
  "Regras:",
  "- O preço que importa é o TOTAL: preço + frete − cashback.",
  "- Se houver referência de quanto a operação já pagou nessa peça, ela é o",
  "  parâmetro principal. Pagar mais caro que o custo habitual é ruim mesmo",
  "  com 40% de desconto anunciado.",
  "- Desconto sobre 'preço normal' informado pela loja não é evidência: lojas",
  "  inflam o preço de referência. Diga isso quando for o caso.",
  "- Sem referência de custo, seja explícito: diga que não há base de",
  "  comparação no estoque e que a nota é menos confiável.",
  "- Nota de 0 a 10. Acima de 7 significa comprar.",
  "- Veredito em no máximo 3 frases.",
].join("\n");

/**
 * Avalia a promoção comparando com o histórico de compras da operação.
 *
 * A nota é da IA; os números que a sustentam são do banco. Sem IA
 * configurada, a função ainda devolve as referências de custo — que já
 * respondem boa parte da pergunta sozinhas.
 */
export async function avaliarPromocao(
  id: string,
  ctx: Ator,
): Promise<AvaliacaoDaPromocao> {
  const promocao = await prisma.promotion.findUnique({
    where: { id },
    select: {
      title: true,
      currentPrice: true,
      regularPrice: true,
      discountPct: true,
      cashbackPct: true,
      shippingCost: true,
      coupon: true,
      store: { select: { name: true } },
    },
  });

  if (!promocao) throw new NaoEncontradoError("Promoção");

  const referencia = await referenciaDeCusto(promocao.title);
  const preco = Number(promocao.currentPrice);
  const frete = Number(promocao.shippingCost ?? 0);
  const cashback = (Number(promocao.cashbackPct ?? 0) / 100) * preco;
  const custoReal = preco + frete - cashback;

  if (!iaDisponivel()) {
    return {
      nota: 0,
      vale: false,
      veredito:
        "IA não configurada. As referências de custo abaixo vêm do seu próprio histórico e já ajudam a decidir.",
      referencias: referencia?.pecas ?? [],
    };
  }

  const contexto = [
    `Oferta: ${promocao.title}`,
    promocao.store ? `Loja: ${promocao.store.name}` : "",
    `Preço anunciado: ${formatarMoeda(preco)}`,
    promocao.regularPrice
      ? `Preço "normal" informado pela loja: ${formatarMoeda(Number(promocao.regularPrice))}`
      : "",
    frete > 0 ? `Frete: ${formatarMoeda(frete)}` : "Frete: grátis ou não informado",
    cashback > 0 ? `Cashback: ${formatarMoeda(cashback)}` : "",
    promocao.coupon ? `Cupom: ${promocao.coupon}` : "",
    `CUSTO REAL (preço + frete − cashback): ${formatarMoeda(custoReal)}`,
    "",
    referencia
      ? [
          `Esta operação já comprou peças parecidas por, em média, ${formatarMoeda(referencia.custoMedio ?? 0)}:`,
          ...referencia.pecas.map(
            (peca) => `  - ${peca.nome}: ${formatarMoeda(peca.custo)} em ${peca.data}`,
          ),
        ].join("\n")
      : "Não há no estoque nenhuma peça parecida com custo registrado. Sem base de comparação.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    // Quem pediu decide o modelo, e portanto de qual cota diária sai.
    //
    // Coleta automática é trabalho de fundo: vai para o modelo de lote, com
    // cota própria. Pessoa clicando "Avaliar" está esperando na tela e usa o
    // modelo bom. Sem esta distinção o bot consumiria, a cada oferta que
    // registra, uma requisição da mesma cota que a leitura de etiqueta usa —
    // e um dia movimentado no grupo deixaria o cadastro de peça sem IA.
    const provider = aiProvider(ctx.userId === null ? "lote" : "interativo");
    const resposta = await provider.gerar({
      sistema: INSTRUCAO,
      mensagens: [{ papel: "user", texto: contexto }],
      schemaDeResposta: {
        type: "object",
        properties: {
          nota: { type: "number" },
          vale: { type: "boolean" },
          veredito: { type: "string" },
        },
        required: ["nota", "vale", "veredito"],
      },
      temperatura: 0.2,
      maxTokens: 2048,
    });

    const parsed = avaliacaoSchema.safeParse(JSON.parse(resposta.texto));
    if (!parsed.success) throw new Error("resposta fora do formato");

    await prisma.promotion.update({
      where: { id },
      data: { aiScore: Math.round(parsed.data.nota), aiVerdict: parsed.data.veredito },
    });

    await registrarAuditoria(
      {
        action: "update",
        entity: "Promotion",
        entityId: id,
        after: { nota: parsed.data.nota },
      },
      ctx,
    );

    return { ...parsed.data, referencias: referencia?.pecas ?? [] };
  } catch (erro) {
    // Falha da IA não apaga a informação útil que já foi apurada.
    return {
      nota: 0,
      vale: false,
      veredito: `Não foi possível avaliar agora (${erro instanceof Error ? erro.message : "erro"}). As referências de custo abaixo continuam valendo.`,
      referencias: referencia?.pecas ?? [],
    };
  }
}
