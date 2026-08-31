import "server-only";

import { cache } from "react";

import type { SpecDefinition } from "@/domain/specs/types";
import { prisma } from "@/server/db/client";

/**
 * Leitura dos catálogos de apoio: categorias, marcas, locais, tags e as
 * definições de especificação que geram os formulários dinâmicos.
 *
 * As funções são envolvidas em `cache()` do React: dentro de uma mesma
 * requisição, a sidebar, o filtro e o formulário pedem a mesma lista de
 * categorias, e não faz sentido ir ao banco três vezes.
 */

export const listarCategorias = cache(async () => {
  return prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      icon: true,
      parentId: true,
      _count: { select: { products: true } },
    },
  });
});

export type CategoriaListada = Awaited<
  ReturnType<typeof listarCategorias>
>[number];

export const listarMarcas = cache(async () => {
  return prisma.brand.findMany({
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true },
  });
});

export const listarLocais = cache(async () => {
  return prisma.location.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true, parentId: true },
  });
});

export const listarTags = cache(async () => {
  return prisma.tag.findMany({
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true, color: true },
  });
});

/**
 * Monta o caminho completo de um local ("Depósito > Estante A > Prateleira A3").
 *
 * Feito em memória a partir da lista já carregada, e não com consulta
 * recursiva: a árvore de locais é pequena por natureza, e uma CTE recursiva
 * aqui seria complexidade sem retorno.
 */
export function caminhoDoLocal(
  locais: readonly { id: string; name: string; parentId: string | null }[],
  locationId: string | null | undefined,
): string {
  if (!locationId) return "";

  const porId = new Map(locais.map((local) => [local.id, local]));
  const partes: string[] = [];

  let atual = porId.get(locationId);
  // Limite de profundidade protege contra ciclo acidental na árvore, que
  // travaria a renderização da página inteira.
  let profundidade = 0;

  while (atual && profundidade < 10) {
    partes.unshift(atual.name);
    atual = atual.parentId ? porId.get(atual.parentId) : undefined;
    profundidade += 1;
  }

  return partes.join(" > ");
}

/**
 * Marcas com a contagem de produtos que as usam.
 *
 * A contagem existe para a tela de configurações poder avisar antes de excluir:
 * marca em uso por produtos não deve sumir sem que a pessoa saiba disso.
 */
export async function listarMarcasComUso() {
  return prisma.brand.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      website: true,
      _count: { select: { products: true } },
    },
  });
}

/** Sócios com quantas peças cada um comprou. */
export async function listarSociosComUso() {
  return prisma.partner.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      active: true,
      _count: { select: { purchasedUnits: true } },
    },
  });
}

/**
 * Definições de especificação de uma categoria, no formato do domínio.
 *
 * É esta função que liga o catálogo em banco à validação e ao formulário
 * dinâmico: adicionar uma spec nova é inserir uma linha, sem tocar em código.
 */
export const definicoesDeSpec = cache(
  async (categoryId: string): Promise<SpecDefinition[]> => {
    const registros = await prisma.specDefinition.findMany({
      where: { categoryId },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    });

    return registros.map((registro) => ({
      key: registro.key,
      label: registro.label,
      type: registro.type,
      unit: registro.unit ?? undefined,
      required: registro.required,
      options: registro.options,
      usedInCompatibility: registro.usedInCompatibility,
      helpText: registro.helpText ?? undefined,
      sortOrder: registro.sortOrder,
    }));
  },
);
