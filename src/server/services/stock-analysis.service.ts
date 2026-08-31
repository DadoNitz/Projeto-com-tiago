import "server-only";

import { z } from "zod";

import { identificarGargalos } from "@/domain/compatibility/suggester";
import { aiProvider, iaDisponivel } from "@/lib/ai";
import { RespostaInvalidaError } from "@/lib/ai/types";
import { prisma } from "@/server/db/client";

import { carregarEstoqueParaMontagem, montarPainelDeSugestoes } from "./build.service";

/**
 * Análise de negócio do estoque (seção 8).
 *
 * A divisão de trabalho é a mesma do resto do sistema: **os fatos são
 * calculados, a narrativa é escrita pela IA**. Excesso, falta, gargalo e
 * estoque parado saem de contas sobre o banco; o modelo recebe esses números
 * prontos e escreve as recomendações.
 *
 * O motivo é direto: "você tem 8 placas AM4 e 2 processadores AM4" é uma
 * afirmação verificável. Se a IA calculasse isso, ela poderia errar a conta e
 * a recomendação viraria uma compra errada.
 */

export interface DiagnosticoDoEstoque {
  totalDeUnidades: number;
  valorInvestido: number;
  valorEstimado: number;
  /** Categorias com muito volume parado, ordenadas por valor. */
  ondeOdinheiroEsta: { categoria: string; unidades: number; valor: number }[];
  /** Peças disponíveis há mais tempo. */
  paradasHaMuitoTempo: {
    codigo: string;
    nome: string;
    diasParada: number;
    valor: number;
  }[];
  gargalos: ReturnType<typeof identificarGargalos>;
  montagensPossiveis: number;
  /** Categorias com desequilíbrio evidente entre si. */
  desequilibrios: { descricao: string }[];
  itensComDefeito: number;
  valorEmDefeito: number;
}

/** Reúne os fatos. Nenhuma IA envolvida — tudo sai de contas sobre o banco. */
export async function levantarDiagnostico(): Promise<DiagnosticoDoEstoque> {
  const [unidades, valores, comDefeito, categorias, paradas, painel] =
    await Promise.all([
      prisma.inventoryUnit.aggregate({
        where: { status: { in: ["AVAILABLE", "RESERVED"] } },
        _sum: { quantity: true },
      }),
      prisma.inventoryUnit.aggregate({
        where: { status: { in: ["AVAILABLE", "RESERVED", "IN_BUILD"] } },
        _sum: { purchaseCost: true, estimatedSalePrice: true },
      }),
      prisma.inventoryUnit.aggregate({
        where: { status: "DEFECTIVE" },
        _sum: { quantity: true, purchaseCost: true },
      }),
      prisma.category.findMany({
        select: {
          name: true,
          products: {
            select: {
              units: {
                where: { status: "AVAILABLE" },
                select: { quantity: true, estimatedSalePrice: true },
              },
            },
          },
        },
      }),
      prisma.inventoryUnit.findMany({
        where: { status: "AVAILABLE" },
        orderBy: { entryDate: "asc" },
        take: 10,
        select: {
          internalCode: true,
          entryDate: true,
          estimatedSalePrice: true,
          product: { select: { name: true } },
        },
      }),
      montarPainelDeSugestoes(10),
    ]);

  const { estoque } = await carregarEstoqueParaMontagem();

  const porCategoria = categorias
    .map((categoria) => {
      const todas = categoria.products.flatMap((produto) => produto.units);
      return {
        categoria: categoria.name,
        unidades: todas.reduce((soma, unidade) => soma + unidade.quantity, 0),
        valor: todas.reduce(
          (soma, unidade) =>
            soma + Number(unidade.estimatedSalePrice ?? 0) * unidade.quantity,
          0,
        ),
      };
    })
    .filter((linha) => linha.unidades > 0)
    .sort((a, b) => b.valor - a.valor);

  const agora = Date.now();

  /*
   * Desequilíbrios entre categorias que se completam.
   *
   * O exemplo da especificação: 8 placas AM4 contra 2 processadores AM4. A
   * conta é feita aqui, e não pelo modelo, porque é uma afirmação verificável
   * — e uma conta errada viraria uma recomendação de compra errada.
   */
  const pares: [string, number, string, number][] = [
    ["processadores", estoque.cpus.length, "placas-mãe", estoque.motherboards.length],
    ["placas de vídeo", estoque.gpus.length, "fontes", estoque.psus.length],
    ["placas-mãe", estoque.motherboards.length, "gabinetes", estoque.cases.length],
    ["placas-mãe", estoque.motherboards.length, "memórias", estoque.rams.length],
  ];

  const desequilibrios = pares
    .filter(([, a, , b]) => Math.abs(a - b) >= 3 && Math.min(a, b) > 0)
    .map(([nomeA, a, nomeB, b]) => ({
      descricao:
        a > b
          ? `${a} ${nomeA} contra ${b} ${nomeB}: sobram ${a - b} ${nomeA}`
          : `${b} ${nomeB} contra ${a} ${nomeA}: sobram ${b - a} ${nomeB}`,
    }));

  return {
    totalDeUnidades: unidades._sum.quantity ?? 0,
    valorInvestido: Number(valores._sum.purchaseCost ?? 0),
    valorEstimado: Number(valores._sum.estimatedSalePrice ?? 0),
    ondeOdinheiroEsta: porCategoria.slice(0, 8),
    paradasHaMuitoTempo: paradas.map((unidade) => ({
      codigo: unidade.internalCode,
      nome: unidade.product.name,
      diasParada: Math.floor(
        (agora - unidade.entryDate.getTime()) / 86_400_000,
      ),
      valor: Number(unidade.estimatedSalePrice ?? 0),
    })),
    gargalos: identificarGargalos(estoque),
    montagensPossiveis: painel.sugestoes.filter(
      (sugestao) => sugestao.compatibilidade.nivel !== "INCOMPATIBLE",
    ).length,
    desequilibrios,
    itensComDefeito: comDefeito._sum.quantity ?? 0,
    valorEmDefeito: Number(comDefeito._sum.purchaseCost ?? 0),
  };
}

const analiseSchema = z.object({
  resumo: z.string(),
  pontosDeAtencao: z.array(z.string()).default([]),
  oportunidades: z.array(z.string()).default([]),
  recomendacoesDeCompra: z.array(z.string()).default([]),
  recomendacoesDeVenda: z.array(z.string()).default([]),
});

export type AnaliseEscrita = z.infer<typeof analiseSchema>;

export interface AnaliseCompleta {
  diagnostico: DiagnosticoDoEstoque;
  narrativa: AnaliseEscrita | null;
  /** `null` quando não há IA configurada: os números continuam valendo. */
  motivoSemNarrativa: string | null;
  geradoEm: Date;
}

const INSTRUCAO = [
  "Você analisa o estoque de uma operação que compra peças de informática,",
  "monta computadores e revende. Escreve em português do Brasil.",
  "",
  "Os números abaixo foram calculados pelo sistema e estão corretos.",
  "Sua função é interpretá-los, não recalculá-los.",
  "",
  "Regras:",
  "- Nunca invente um número que não esteja nos dados.",
  "- Cada recomendação precisa apontar o dado que a sustenta.",
  "- Seja específico: 'comprar 4 processadores AM4' vale mais que",
  "  'considerar ampliar o estoque de processadores'.",
  "- Se algo não é problema, não invente preocupação. Lista curta e útil vale",
  "  mais que lista longa e genérica.",
  "- No máximo 4 itens por lista.",
].join("\n");

/**
 * Gera a análise completa.
 *
 * Quando não há IA configurada, devolve os fatos sem narrativa — o
 * diagnóstico numérico é útil sozinho, e esconder a tela inteira por falta de
 * chave seria desperdiçar o que já está calculado.
 */
export async function analisarEstoque(): Promise<AnaliseCompleta> {
  const diagnostico = await levantarDiagnostico();

  if (!iaDisponivel()) {
    return {
      diagnostico,
      narrativa: null,
      motivoSemNarrativa:
        "IA não configurada. Os números abaixo são calculados pelo sistema e não dependem dela.",
      geradoEm: new Date(),
    };
  }

  try {
    const provider = aiProvider();

    const resposta = await provider.gerar({
      sistema: INSTRUCAO,
      mensagens: [
        {
          papel: "user",
          texto: `Analise este estoque:\n\n${JSON.stringify(diagnostico, null, 1)}`,
        },
      ],
      schemaDeResposta: {
        type: "object",
        properties: {
          resumo: {
            type: "string",
            description: "Dois ou três parágrafos curtos sobre a situação geral",
          },
          pontosDeAtencao: { type: "array", items: { type: "string" } },
          oportunidades: { type: "array", items: { type: "string" } },
          recomendacoesDeCompra: { type: "array", items: { type: "string" } },
          recomendacoesDeVenda: { type: "array", items: { type: "string" } },
        },
        required: ["resumo"],
      },
      temperatura: 0.3,
      maxTokens: 4096,
    });

    const bruto: unknown = JSON.parse(resposta.texto);
    const parsed = analiseSchema.safeParse(bruto);

    if (!parsed.success) throw new RespostaInvalidaError("formato inesperado");

    // Guardar entrada e saída permite auditar depois se a recomendação bate
    // com os números que a produziram.
    await prisma.aIAnalysis
      .create({
        data: {
          type: "STOCK_DIAGNOSIS",
          input: diagnostico as object,
          result: parsed.data as object,
          narrative: parsed.data.resumo,
          provider: resposta.provider,
          model: resposta.modelo,
        },
      })
      .catch((erro: unknown) => {
        console.error("[analise] falha ao gravar:", erro);
      });

    return {
      diagnostico,
      narrativa: parsed.data,
      motivoSemNarrativa: null,
      geradoEm: new Date(),
    };
  } catch (erro) {
    // Falha da IA não derruba a tela: os fatos continuam de pé.
    const mensagem =
      erro instanceof Error ? erro.message : "falha ao gerar a análise";
    return {
      diagnostico,
      narrativa: null,
      motivoSemNarrativa: mensagem,
      geradoEm: new Date(),
    };
  }
}
