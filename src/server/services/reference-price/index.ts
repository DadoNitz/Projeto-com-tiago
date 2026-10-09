import "server-only";

import {
  anuncioRelevante,
  montarConsulta,
  resumirPrecos,
  type ResumoDePrecos,
  type Rigor,
} from "@/domain/pricing/preco-de-referencia";
import { prisma } from "@/server/db/client";

import { FONTES, type Anuncio, type Condicao } from "./fontes";

/**
 * Worker do preço de mercado de referência.
 *
 * Roda em segundo plano (`after()` das Server Actions) em três momentos:
 * quando uma peça é cadastrada, quando alguém pede para atualizar o estoque
 * inteiro, e quando alguém pede para buscar de novo uma peça específica. A
 * tela nunca espera a busca: lê o que já está salvo no produto.
 *
 * Estados (`Product.referencePriceStatus`):
 * - `PENDING`: na fila ou buscando.
 * - `OK`: há preço de referência.
 * - `NOT_FOUND`: as fontes responderam, mas nenhum anúncio era da mesma peça.
 * - `FAILED`: nenhuma fonte respondeu.
 */

export type StatusDaReferencia = "PENDING" | "OK" | "NOT_FOUND" | "FAILED";

/**
 * O que fica salvo em `referencePriceData`, para conferir a origem do número.
 * O formato é o mesmo que a tela lê (`DadosDoPrecoDeMercado`).
 */
export interface DadosDaReferencia {
  consulta: string;
  rigor: Rigor | null;
  condicao: Condicao | null;
  resumo: ResumoDePrecos | null;
  /** Anúncios que as fontes devolveram, antes do filtro de mesma peça. */
  encontrados: number;
  /** Anúncios da mesma peça, do mais barato ao mais caro. */
  anuncios: (Anuncio & { entrou: boolean })[];
  falhas: { fonte: string; motivo: string }[];
}

/** Quantos anúncios guardar como prova — todos os que costumam aparecer. */
const ANUNCIOS_GUARDADOS = 40;

/** Mínimo de anúncios de usado para preferir o usado à loja. */
const MINIMO_DE_USADOS = 2;

/**
 * Mínimo de anúncios para publicar uma média. Com um ou dois, a "média" é o
 * preço de um vendedor qualquer — testado: uma RX 6600 XT saiu a R$ 4.650 com
 * um anúncio só.
 */
const MINIMO_PARA_MEDIA = 3;

/** Pausa entre produtos no lote: não metralhar as fontes. */
const PAUSA_ENTRE_PRODUTOS_MS = 1_500;

/** Pendência mais velha que isto é considerada abandonada (worker morreu). */
export const PENDENCIA_ABANDONADA_MS = 15 * 60 * 1000;

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Filtra os anúncios da mesma peça, do mais rigoroso ao mais solto. */
function filtrar(
  consulta: string,
  anuncios: Anuncio[],
  categoria: string,
): { rigor: Rigor; anuncios: Anuncio[] } | null {
  // O estrito vale quando acha o bastante para uma média; senão tenta o
  // aproximado, e fica com o que achou mais.
  let melhor: { rigor: Rigor; anuncios: Anuncio[] } | null = null;
  for (const rigor of ["estrito", "aproximado"] as const) {
    const relevantes = anuncios.filter((a) =>
      anuncioRelevante(consulta, a.titulo, rigor, categoria),
    );
    if (relevantes.length >= MINIMO_PARA_MEDIA) return { rigor, anuncios: relevantes };
    if (relevantes.length > (melhor?.anuncios.length ?? 0)) {
      melhor = { rigor, anuncios: relevantes };
    }
  }
  return melhor;
}

/**
 * Busca e grava o preço de referência de um produto.
 *
 * Nunca lança: falha de fonte vira estado `FAILED` salvo no produto, para a
 * tela mostrar "não consegui buscar" em vez de ficar "buscando" para sempre.
 */
export async function atualizarPrecoDeReferencia(
  productId: string,
): Promise<StatusDaReferencia> {
  const produto = await prisma.product.findUnique({
    where: { id: productId },
    select: { name: true, category: { select: { slug: true } } },
  });
  if (!produto) return "FAILED";

  const consulta = montarConsulta(produto.name, produto.category.slug);
  const falhas: DadosDaReferencia["falhas"] = [];
  const porCondicao: Record<Condicao, Anuncio[]> = { USADO: [], NOVO: [] };

  const disponiveis = await Promise.all(
    FONTES.map(async (f) => ((await f.disponivel()) ? f : null)),
  );
  const fontes = disponiveis.filter((f) => f !== null);
  await Promise.all(
    fontes.map(async (fonte) => {
      try {
        for (const anuncio of await fonte.buscar(consulta)) {
          porCondicao[anuncio.condicao].push(anuncio);
        }
      } catch (erro) {
        falhas.push({
          fonte: fonte.nome,
          motivo: erro instanceof Error ? erro.message : "erro desconhecido",
        });
      }
    }),
  );

  // Usado é o que interessa (é o que se vende aqui). Loja só entra quando
  // não há usado suficiente — e a tela diz que o número é de peça nova.
  const categoria = produto.category.slug;
  const usados = filtrar(consulta, porCondicao.USADO, categoria);
  const escolha: { condicao: Condicao; rigor: Rigor; anuncios: Anuncio[] } | null =
    usados && usados.anuncios.length >= MINIMO_DE_USADOS
      ? { condicao: "USADO", ...usados }
      : (() => {
          const novos = filtrar(consulta, porCondicao.NOVO, categoria);
          return novos ? { condicao: "NOVO" as const, ...novos } : null;
        })();

  const calculado = escolha
    ? resumirPrecos(escolha.anuncios.map((a) => a.preco))
    : null;
  const resumo =
    calculado && calculado.amostras >= MINIMO_PARA_MEDIA ? calculado : null;

  const respondeu = falhas.length < fontes.length;
  const status: StatusDaReferencia = resumo
    ? "OK"
    : respondeu
      ? "NOT_FOUND"
      : "FAILED";

  // Entrou na média quem ficou dentro da faixa que sobrou depois de tirar os
  // extremos (a faixa é contínua: os preços são ordenados antes do corte).
  const entrou = (preco: number) =>
    calculado !== null &&
    preco >= calculado.minimo &&
    preco <= calculado.maximo;

  const dados: DadosDaReferencia = {
    consulta,
    rigor: escolha?.rigor ?? null,
    condicao: escolha?.condicao ?? null,
    resumo,
    encontrados: porCondicao.USADO.length + porCondicao.NOVO.length,
    anuncios: (escolha?.anuncios ?? [])
      .slice()
      .sort((a, b) => a.preco - b.preco)
      .slice(0, ANUNCIOS_GUARDADOS)
      .map((anuncio) => ({ ...anuncio, entrou: entrou(anuncio.preco) })),
    falhas,
  };

  await prisma.product.update({
    where: { id: productId },
    data: {
      referencePriceStatus: status,
      referencePriceAt: new Date(),
      referencePriceData: dados as object,
      // Falha não apaga a referência anterior: preço de ontem é melhor que
      // nenhum. Só "achou outro" ou "procurou e não existe" a substituem.
      ...(status === "FAILED"
        ? {}
        : {
            referencePrice: resumo?.media ?? null,
            referencePriceKind: escolha?.condicao ?? null,
          }),
    },
  });

  return status;
}

/** Marca produtos como pendentes, para a tela mostrar "buscando". */
export async function marcarPendentes(productIds: string[]): Promise<void> {
  if (productIds.length === 0) return;
  await prisma.product.updateMany({
    where: { id: { in: productIds } },
    data: { referencePriceStatus: "PENDING", referencePriceAt: new Date() },
  });
}

/**
 * Marca todos os modelos que têm peça no estoque. Devolve os ids marcados.
 *
 * Peça vendida ou descartada fica de fora: o preço de mercado serve para
 * decidir por quanto vender o que ainda está aqui.
 */
export async function marcarEstoqueInteiro(): Promise<string[]> {
  const produtos = await prisma.product.findMany({
    where: {
      deletedAt: null,
      units: {
        some: { deletedAt: null, status: { notIn: ["SOLD", "DISCARDED"] } },
      },
    },
    select: { id: true },
  });
  const ids = produtos.map((p) => p.id);
  await marcarPendentes(ids);
  return ids;
}

/** Processa uma lista de produtos em sequência, com pausa entre eles. */
export async function processarProdutos(productIds: string[]): Promise<void> {
  for (const [indice, id] of productIds.entries()) {
    if (indice > 0) await espera(PAUSA_ENTRE_PRODUTOS_MS);
    try {
      await atualizarPrecoDeReferencia(id);
    } catch (erro) {
      // Erro de banco num produto não pode parar o lote inteiro.
      console.error("[preco-de-referencia]", id, erro);
    }
  }
}
