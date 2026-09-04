import "server-only";

import { compare, hash } from "bcryptjs";

import { CUSTO_HASH, validarSenha } from "@/domain/auth/password";
import { Role } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/client";
import type { ActionContext } from "@/server/session";

import { registrarAuditoria } from "./audit.service";
import {
  ConflitoError,
  NaoEncontradoError,
  RegraDeNegocioError,
} from "./errors";

/**
 * Gestão de usuários (seção 16).
 *
 * Sem isto o sistema não sai do papel: as contas só existiam se criadas pelo
 * seed, com senha escrita num arquivo versionado. Não havia como dar acesso a
 * uma pessoa nova nem trocar uma senha comprometida.
 *
 * Nenhuma senha em claro sai daqui, nem em log, nem em retorno de função.
 */

export async function listarUsuarios() {
  return prisma.user.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
}

export interface NovoUsuario {
  name: string;
  email: string;
  role: Role;
  senha: string;
}

export async function criarUsuario(
  dados: NovoUsuario,
  ctx: ActionContext,
): Promise<{ id: string }> {
  const email = dados.email.toLowerCase().trim();

  const erroSenha = validarSenha(dados.senha);
  if (erroSenha) throw new RegraDeNegocioError(erroSenha);

  const existente = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existente) {
    throw new ConflitoError("Já existe uma conta com este e-mail.");
  }

  const usuario = await prisma.user.create({
    data: {
      name: dados.name.trim(),
      email,
      role: dados.role,
      passwordHash: await hash(dados.senha, CUSTO_HASH),
    },
    select: { id: true },
  });

  await registrarAuditoria(
    {
      action: "create",
      entity: "User",
      entityId: usuario.id,
      // A senha nunca entra na trilha. O que importa auditar é quem ganhou
      // acesso e com qual permissão.
      after: { email, role: dados.role },
    },
    ctx,
  );

  return usuario;
}

export async function alterarPapel(
  userId: string,
  role: Role,
  ctx: ActionContext,
): Promise<void> {
  const alvo = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true },
  });
  if (!alvo) throw new NaoEncontradoError("Usuário");

  // Rebaixar o próprio acesso deixaria o sistema sem administrador se essa
  // fosse a única conta ADMIN — e sem administrador não há como recuperar.
  if (alvo.id === ctx.userId && role !== Role.ADMIN) {
    throw new RegraDeNegocioError(
      "Você não pode rebaixar a própria conta. Peça a outro administrador.",
    );
  }

  await garantirQueRestaAdministrador(alvo.id, alvo.role, role);

  await prisma.user.update({ where: { id: userId }, data: { role } });

  await registrarAuditoria(
    {
      action: "update",
      entity: "User",
      entityId: userId,
      before: { role: alvo.role },
      after: { role },
    },
    ctx,
  );
}

export async function definirAtivo(
  userId: string,
  active: boolean,
  ctx: ActionContext,
): Promise<void> {
  const alvo = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, active: true },
  });
  if (!alvo) throw new NaoEncontradoError("Usuário");

  if (alvo.id === ctx.userId && !active) {
    throw new RegraDeNegocioError("Você não pode desativar a própria conta.");
  }

  if (!active) {
    await garantirQueRestaAdministrador(alvo.id, alvo.role, null);
  }

  await prisma.user.update({ where: { id: userId }, data: { active } });

  await registrarAuditoria(
    {
      action: "update",
      entity: "User",
      entityId: userId,
      before: { active: alvo.active },
      after: { active },
    },
    ctx,
  );
}

/**
 * Redefinição de senha por um administrador.
 *
 * Usada quando alguém esquece a senha ou quando uma senha vaza. Não pede a
 * senha antiga — o administrador não a conhece, e exigir isso tornaria a
 * recuperação impossível, que é justamente o caso de uso.
 */
export async function redefinirSenha(
  userId: string,
  novaSenha: string,
  ctx: ActionContext,
): Promise<void> {
  const erro = validarSenha(novaSenha);
  if (erro) throw new RegraDeNegocioError(erro);

  const alvo = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!alvo) throw new NaoEncontradoError("Usuário");

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hash(novaSenha, CUSTO_HASH) },
  });

  await registrarAuditoria(
    {
      action: "update",
      entity: "User",
      entityId: userId,
      after: { senhaRedefinidaPor: ctx.name },
    },
    ctx,
  );
}

/**
 * Troca da própria senha.
 *
 * Aqui a senha atual **é** exigida: sem isso, quem pegasse uma sessão aberta
 * numa máquina destravada trocaria a senha e tomaria a conta.
 */
export async function trocarPropriaSenha(
  args: { senhaAtual: string; novaSenha: string },
  ctx: ActionContext,
): Promise<void> {
  const erro = validarSenha(args.novaSenha);
  if (erro) throw new RegraDeNegocioError(erro);

  const usuario = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { id: true, passwordHash: true },
  });
  if (!usuario) throw new NaoEncontradoError("Usuário");

  const confere = await compare(args.senhaAtual, usuario.passwordHash);
  if (!confere) {
    throw new RegraDeNegocioError("A senha atual está incorreta.");
  }

  if (args.senhaAtual === args.novaSenha) {
    throw new RegraDeNegocioError("A nova senha precisa ser diferente da atual.");
  }

  await prisma.user.update({
    where: { id: ctx.userId },
    data: { passwordHash: await hash(args.novaSenha, CUSTO_HASH) },
  });

  await registrarAuditoria(
    { action: "update", entity: "User", entityId: ctx.userId, after: { senhaTrocada: true } },
    ctx,
  );
}

/**
 * Impede que o sistema fique sem nenhum administrador ativo.
 *
 * É a trava que evita o estado sem volta: sem ADMIN, ninguém consegue criar
 * usuário, mudar papel nem redefinir senha — e a recuperação só sairia por
 * SQL direto no banco.
 */
async function garantirQueRestaAdministrador(
  userId: string,
  papelAtual: Role,
  papelNovo: Role | null,
): Promise<void> {
  if (papelAtual !== Role.ADMIN) return;
  if (papelNovo === Role.ADMIN) return;

  const outrosAdmins = await prisma.user.count({
    where: { role: Role.ADMIN, active: true, id: { not: userId } },
  });

  if (outrosAdmins === 0) {
    throw new RegraDeNegocioError(
      "Este é o único administrador ativo. Promova outra pessoa antes de alterar esta conta.",
    );
  }
}
