import "server-only";

import { z } from "zod";

import { aiProvider } from "@/lib/ai";
import { RespostaInvalidaError } from "@/lib/ai/types";
import type { ListingChannel } from "@/generated/prisma/enums";
import { formatarMoeda } from "@/lib/format";
import { prisma } from "@/server/db/client";
import type { ActionContext } from "@/server/session";

import { NaoEncontradoError } from "./errors";

/**
 * Geração de anúncio de venda (Facebook Marketplace, OLX, WhatsApp).
 *
 * O princípio é o mesmo do resto do sistema: **a IA escreve, os dados vêm do
 * banco**. As especificações que entram no anúncio são as cadastradas, não o
 * que o modelo lembra sobre aquela peça. Um anúncio com spec inventada gera
 * reclamação de comprador e devolução.
 *
 * O texto nunca é publicado automaticamente: fica como rascunho para revisão.
 */

const LIMITE_POR_CANAL: Record<ListingChannel, number> = {
  FACEBOOK_MARKETPLACE: 4000,
  OLX: 4000,
  MERCADO_LIVRE: 4000,
  // WhatsApp e Instagram são lidos na tela pequena, rolando: texto longo perde
  // o leitor antes do preço.
  WHATSAPP: 900,
  INSTAGRAM: 900,
  OUTRO: 2000,
};

const TOM_POR_CANAL: Record<ListingChannel, string> = {
  FACEBOOK_MARKETPLACE:
    "Marketplace do Facebook: comprador leigo ou intermediário. Comece pelo que a máquina faz, não pela ficha técnica. Use parágrafos curtos e uma lista de especificações no fim.",
  OLX: "OLX: comprador comparando preço. Seja objetivo, destaque o estado de conservação e o que está incluso.",
  MERCADO_LIVRE:
    "Mercado Livre: comprador técnico. Ficha completa, sem exageros, com todas as especificações.",
  WHATSAPP:
    "WhatsApp: mensagem curta para mandar direto ao cliente. No máximo 6 linhas, com emoji moderado.",
  INSTAGRAM:
    "Instagram: legenda curta e chamativa, com quebras de linha e no máximo 5 hashtags no fim.",
  OUTRO: "Anúncio genérico, objetivo.",
};

const respostaSchema = z.object({
  titulo: z.string().min(3),
  descricao: z.string().min(20),
  textoCurto: z.string().optional(),
});

function descreverSpecs(specs: unknown): string {
  if (typeof specs !== "object" || specs === null) return "";

  return Object.entries(specs as Record<string, unknown>)
    .map(([chave, valor]) => {
      const texto = Array.isArray(valor)
        ? valor.join(", ")
        : typeof valor === "boolean"
          ? valor
            ? "sim"
            : "não"
          : String(valor);
      return `  ${chave}: ${texto}`;
    })
    .join("\n");
}

const ROTULO_CONDICAO: Record<string, string> = {
  NEW: "novo, sem uso",
  LIKE_NEW: "seminovo, pouco uso",
  USED: "usado, funcionando",
  DEFECTIVE: "com defeito",
  FOR_TESTING: "sem teste, vendido no estado",
};

function instrucao(canal: ListingChannel): string {
  return [
    "Você escreve anúncios de venda de peças e computadores usados, em",
    "português do Brasil.",
    "",
    TOM_POR_CANAL[canal],
    "",
    "Regras invioláveis:",
    "- Use SOMENTE as especificações fornecidas. Nunca acrescente uma",
    "  característica que não está na lista, mesmo que aquele modelo",
    "  normalmente a tenha. Anúncio com spec errada vira devolução.",
    "- Não invente garantia, nota fiscal, acessórios ou brindes.",
    "- Declare o estado de conservação exatamente como informado. Se a peça",
    "  está com defeito ou sem teste, isso precisa aparecer com clareza — e",
    "  não escondido no fim.",
    "- Nada de superlativos vazios (imperdível, top de linha, o melhor).",
    "- Não prometa desempenho em jogos ou programas específicos: você não tem",
    "  como saber.",
    `- Limite de ${LIMITE_POR_CANAL[canal]} caracteres na descrição.`,
  ].join("\n");
}

export interface AnuncioGerado {
  titulo: string;
  descricao: string;
  textoCurto?: string | undefined;
  canal: ListingChannel;
  listingId: string;
}

/** Gera o anúncio de uma unidade avulsa. */
export async function gerarAnuncioDeUnidade(
  args: { unitId: string; canal: ListingChannel; preco?: number | undefined },
  ctx: ActionContext,
): Promise<AnuncioGerado> {
  const unidade = await prisma.inventoryUnit.findUnique({
    where: { id: args.unitId },
    select: {
      id: true,
      condition: true,
      estimatedSalePrice: true,
      notes: true,
      product: {
        select: {
          name: true,
          model: true,
          specs: true,
          description: true,
          brand: { select: { name: true } },
          category: { select: { name: true } },
        },
      },
    },
  });

  if (!unidade) throw new NaoEncontradoError("Unidade de estoque");

  const preco =
    args.preco ?? (Number(unidade.estimatedSalePrice ?? 0) || undefined);

  const dados = [
    `Categoria: ${unidade.product.category.name}`,
    `Produto: ${unidade.product.name}`,
    unidade.product.brand ? `Marca: ${unidade.product.brand.name}` : "",
    unidade.product.model ? `Modelo: ${unidade.product.model}` : "",
    `Estado: ${ROTULO_CONDICAO[unidade.condition] ?? unidade.condition}`,
    preco ? `Preço: ${formatarMoeda(preco)}` : "",
    unidade.notes ? `Observações do estoque: ${unidade.notes}` : "",
    "",
    "Especificações cadastradas:",
    descreverSpecs(unidade.product.specs) || "  (nenhuma cadastrada)",
  ]
    .filter(Boolean)
    .join("\n");

  return gerar({ canal: args.canal, dados, unitId: args.unitId, preco }, ctx);
}

/** Gera o anúncio de um computador montado. */
export async function gerarAnuncioDeMontagem(
  args: { buildId: string; canal: ListingChannel; preco?: number | undefined },
  ctx: ActionContext,
): Promise<AnuncioGerado> {
  const build = await prisma.build.findUnique({
    where: { id: args.buildId },
    select: {
      id: true,
      name: true,
      tier: true,
      useCase: true,
      salePrice: true,
      notes: true,
      items: {
        select: {
          role: true,
          unit: {
            select: {
              condition: true,
              product: {
                select: {
                  name: true,
                  specs: true,
                  brand: { select: { name: true } },
                  category: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!build) throw new NaoEncontradoError("Montagem");

  const preco = args.preco ?? (Number(build.salePrice ?? 0) || undefined);

  const componentes = build.items
    .map((item) => {
      const marca = item.unit.product.brand?.name;
      const nome = marca
        ? `${marca} ${item.unit.product.name}`
        : item.unit.product.name;
      return [
        `- ${item.unit.product.category.name}: ${nome} (${ROTULO_CONDICAO[item.unit.condition] ?? item.unit.condition})`,
        descreverSpecs(item.unit.product.specs),
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const dados = [
    `Computador montado: ${build.name}`,
    build.tier ? `Nível: ${build.tier}` : "",
    build.useCase ? `Uso indicado: ${build.useCase}` : "",
    preco ? `Preço: ${formatarMoeda(preco)}` : "",
    build.notes ? `Observações: ${build.notes}` : "",
    "",
    "Componentes:",
    componentes,
  ]
    .filter(Boolean)
    .join("\n");

  return gerar({ canal: args.canal, dados, buildId: args.buildId, preco }, ctx);
}

async function gerar(
  args: {
    canal: ListingChannel;
    dados: string;
    unitId?: string;
    buildId?: string;
    preco?: number | undefined;
  },
  ctx: ActionContext,
): Promise<AnuncioGerado> {
  const provider = aiProvider();

  const resposta = await provider.gerar({
    sistema: instrucao(args.canal),
    mensagens: [
      {
        papel: "user",
        texto: [
          "Escreva o anúncio para os dados abaixo.",
          "",
          args.dados,
          "",
          "Em 'textoCurto', escreva uma versão de uma ou duas frases para",
          "mandar por mensagem.",
        ].join("\n"),
      },
    ],
    schemaDeResposta: {
      type: "object",
      properties: {
        titulo: {
          type: "string",
          description: "Título do anúncio, no máximo 90 caracteres",
        },
        descricao: { type: "string" },
        textoCurto: { type: "string" },
      },
      required: ["titulo", "descricao"],
    },
    // Um pouco de variação: anúncio idêntico repetido em série chama atenção
    // negativa nas plataformas. Mas baixa o bastante para não inventar.
    temperatura: 0.6,
    maxTokens: 4096,
  });

  let bruto: unknown;
  try {
    bruto = JSON.parse(resposta.texto);
  } catch {
    throw new RespostaInvalidaError("o anúncio não veio em JSON válido");
  }

  const parsed = respostaSchema.safeParse(bruto);
  if (!parsed.success) {
    throw new RespostaInvalidaError("o anúncio veio incompleto");
  }

  const listing = await prisma.listing.create({
    data: {
      unitId: args.unitId ?? null,
      buildId: args.buildId ?? null,
      channel: args.canal,
      status: "DRAFT",
      title: parsed.data.titulo.slice(0, 200),
      description: parsed.data.descricao.slice(0, LIMITE_POR_CANAL[args.canal]),
      shortText: parsed.data.textoCurto ?? null,
      price: args.preco ?? null,
      generatedByAI: true,
      aiProvider: resposta.provider,
      aiModel: resposta.modelo,
      // Guardar o canal usado permite reproduzir ou ajustar a geração depois.
      aiPrompt: args.canal,
    },
    select: { id: true },
  });

  void ctx;

  return {
    titulo: parsed.data.titulo,
    descricao: parsed.data.descricao,
    textoCurto: parsed.data.textoCurto,
    canal: args.canal,
    listingId: listing.id,
  };
}

/** Anúncios já gerados para uma unidade ou montagem. */
export async function listarAnuncios(args: {
  unitId?: string | undefined;
  buildId?: string | undefined;
}) {
  return prisma.listing.findMany({
    where: {
      ...(args.unitId ? { unitId: args.unitId } : {}),
      ...(args.buildId ? { buildId: args.buildId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      channel: true,
      status: true,
      title: true,
      description: true,
      shortText: true,
      price: true,
      createdAt: true,
    },
  });
}
