import "server-only";

import { prisma } from "@/server/db/client";
import type { ActionContext } from "@/server/session";

import { registrarAuditoria } from "./audit.service";
import { ConflitoError, NaoEncontradoError, RegraDeNegocioError } from "./errors";

/**
 * Escrita dos catálogos de apoio: marcas, locais, sócios e tags.
 *
 * Categorias ficam de fora deste caminho simples de propósito: criar uma
 * categoria sem definir suas especificações produz um formulário de cadastro
 * vazio, e uma categoria que o motor de compatibilidade não conhece. Elas
 * nascem pelo seed, a partir do catálogo versionado em código.
 */

/**
 * Gera o slug a partir do nome.
 *
 * O slug é a chave de unicidade: é ele que impede "Kingston", "kingston" e
 * "KINGSTON" de virarem três marcas diferentes — e três marcas diferentes
 * quebrariam qualquer filtro e qualquer relatório por marca.
 */
export function slugificar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------------------
// Marcas
// ---------------------------------------------------------------------------

export async function criarMarca(
  dados: { name: string; website?: string | undefined },
  ctx: ActionContext,
): Promise<{ id: string }> {
  const slug = slugificar(dados.name);
  if (!slug) throw new RegraDeNegocioError("Informe um nome válido.");

  const existente = await prisma.brand.findUnique({ where: { slug } });
  if (existente) {
    throw new ConflitoError(
      `A marca "${existente.name}" já existe. Use a que já está cadastrada.`,
    );
  }

  const marca = await prisma.brand.create({
    data: {
      slug,
      name: dados.name.trim(),
      website: dados.website?.trim() || null,
    },
    select: { id: true },
  });

  await registrarAuditoria(
    { action: "create", entity: "Brand", entityId: marca.id, after: dados },
    ctx,
  );

  return marca;
}

export async function renomearMarca(
  dados: { id: string; name: string },
  ctx: ActionContext,
): Promise<void> {
  const marca = await prisma.brand.findUnique({
    where: { id: dados.id },
    select: { name: true },
  });
  if (!marca) throw new NaoEncontradoError("Marca");

  // O slug NÃO é regerado ao renomear. Ele é a identidade estável do
  // registro; mudá-lo poderia colidir com outra marca e quebraria qualquer
  // referência externa por slug.
  await prisma.brand.update({
    where: { id: dados.id },
    data: { name: dados.name.trim() },
  });

  await registrarAuditoria(
    {
      action: "update",
      entity: "Brand",
      entityId: dados.id,
      before: { name: marca.name },
      after: { name: dados.name },
    },
    ctx,
  );
}

export async function excluirMarca(
  id: string,
  ctx: ActionContext,
): Promise<void> {
  const emUso = await prisma.product.count({ where: { brandId: id } });
  if (emUso > 0) {
    throw new ConflitoError(
      `Esta marca está em ${emUso} produto(s). Troque a marca deles antes de excluir.`,
    );
  }

  await prisma.brand.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await registrarAuditoria(
    { action: "delete", entity: "Brand", entityId: id },
    ctx,
  );
}

// ---------------------------------------------------------------------------
// Locais
// ---------------------------------------------------------------------------

export async function criarLocal(
  dados: {
    name: string;
    code?: string | undefined;
    parentId?: string | undefined;
    notes?: string | undefined;
  },
  ctx: ActionContext,
): Promise<{ id: string }> {
  const nome = dados.name.trim();
  if (nome.length < 1) throw new RegraDeNegocioError("Informe o nome do local.");

  if (dados.code) {
    const existente = await prisma.location.findUnique({
      where: { code: dados.code.trim() },
    });
    if (existente) {
      throw new ConflitoError(`Já existe um local com o código ${dados.code}.`);
    }
  }

  const local = await prisma.location.create({
    data: {
      name: nome,
      code: dados.code?.trim() || null,
      parentId: dados.parentId || null,
      notes: dados.notes?.trim() || null,
    },
    select: { id: true },
  });

  await registrarAuditoria(
    { action: "create", entity: "Location", entityId: local.id, after: dados },
    ctx,
  );

  return local;
}

export async function excluirLocal(
  id: string,
  ctx: ActionContext,
): Promise<void> {
  const [comPecas, comFilhos] = await Promise.all([
    prisma.inventoryUnit.count({ where: { locationId: id } }),
    prisma.location.count({ where: { parentId: id } }),
  ]);

  if (comPecas > 0) {
    throw new ConflitoError(
      `Há ${comPecas} peça(s) neste local. Transfira-as antes de excluir — senão elas ficariam sem localização e ninguém as acharia.`,
    );
  }
  if (comFilhos > 0) {
    throw new ConflitoError(
      "Este local tem sublocais. Exclua-os primeiro.",
    );
  }

  await prisma.location.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await registrarAuditoria(
    { action: "delete", entity: "Location", entityId: id },
    ctx,
  );
}

// ---------------------------------------------------------------------------
// Sócios
// ---------------------------------------------------------------------------

export async function criarSocio(
  dados: {
    name: string;
    email?: string | undefined;
    phone?: string | undefined;
    notes?: string | undefined;
  },
  ctx: ActionContext,
): Promise<{ id: string }> {
  const slug = slugificar(dados.name);
  if (!slug) throw new RegraDeNegocioError("Informe um nome válido.");

  const existente = await prisma.partner.findUnique({ where: { slug } });
  if (existente) {
    throw new ConflitoError(`Já existe um sócio chamado "${existente.name}".`);
  }

  const socio = await prisma.partner.create({
    data: {
      slug,
      name: dados.name.trim(),
      email: dados.email?.trim() || null,
      phone: dados.phone?.trim() || null,
      notes: dados.notes?.trim() || null,
    },
    select: { id: true },
  });

  await registrarAuditoria(
    { action: "create", entity: "Partner", entityId: socio.id, after: dados },
    ctx,
  );

  return socio;
}

/**
 * Desativa um sócio em vez de excluí-lo.
 *
 * O extrato dele precisa continuar existindo: as peças que ele pagou seguem no
 * estoque e as vendas passadas seguem no histórico. Excluir apagaria a
 * resposta para "quem pagou por esta peça".
 */
export async function desativarSocio(
  id: string,
  ctx: ActionContext,
): Promise<void> {
  await prisma.partner.update({ where: { id }, data: { active: false } });

  await registrarAuditoria(
    {
      action: "update",
      entity: "Partner",
      entityId: id,
      after: { active: false },
    },
    ctx,
  );
}

export async function reativarSocio(
  id: string,
  ctx: ActionContext,
): Promise<void> {
  await prisma.partner.update({ where: { id }, data: { active: true } });

  await registrarAuditoria(
    {
      action: "update",
      entity: "Partner",
      entityId: id,
      after: { active: true },
    },
    ctx,
  );
}
