import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Role } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/client";
import { ConflitoError, RegraDeNegocioError } from "@/server/services/errors";
import { validarSenha } from "@/domain/auth/password";
import {
  alterarPapel,
  criarUsuario,
  definirAtivo,
  redefinirSenha,
  trocarPropriaSenha,
} from "@/server/services/user.service";
import type { ActionContext } from "@/server/session";

/**
 * Gestão de usuários.
 *
 * O que se testa aqui são as travas: o sistema não pode chegar a um estado sem
 * nenhum administrador ativo, porque a recuperação sairia só por SQL direto no
 * banco.
 */

const MARCADOR = "teste-usuario";
let ctx: ActionContext;

beforeAll(async () => {
  const admin = await prisma.user.findFirstOrThrow({
    where: { role: Role.ADMIN, active: true },
    select: { id: true, name: true, role: true },
  });
  ctx = {
    userId: admin.id,
    role: admin.role,
    name: admin.name,
    ip: null,
    userAgent: "vitest",
  };
});

afterAll(async () => {
  const criados = await prisma.user.findMany({
    where: { email: { contains: MARCADOR } },
    select: { id: true },
  });
  const ids = criados.map((u) => u.id);
  if (ids.length === 0) return;

  await prisma.$executeRawUnsafe(
    `DELETE FROM "audit_logs" WHERE "entityId" = ANY($1::text[]) OR "userId" = ANY($1::text[])`,
    ids,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "users" WHERE id = ANY($1::text[])`,
    ids,
  );
});

function email(sufixo: string): string {
  return `${MARCADOR}-${sufixo}-${Date.now()}@local.test`;
}

describe("validação de senha", () => {
  it("exige comprimento em vez de símbolos decorativos", () => {
    // Regra de "um número e um símbolo" empurra para `Senha@1`, que é curta e
    // previsível. Comprimento resiste muito mais a força bruta.
    expect(validarSenha("curta1!")).not.toBeNull();
    expect(validarSenha("cavalo bateria grampo")).toBeNull();
  });

  it("recusa as senhas que todo mundo tenta primeiro", () => {
    expect(validarSenha("senha123456")).not.toBeNull();
    expect(validarSenha("admin123456")).not.toBeNull();
    expect(validarSenha("estoque2024")).not.toBeNull();
  });

  it("aceita senha sem palavra obvia, mesmo com muitos digitos", () => {
    // Regressao: a checagem do que "sobra" descartava todos os digitos e
    // reprovava `Nitz351642` — dez caracteres, nada previsivel. A pergunta
    // certa nao e quantas letras sobram, e sim se a senha e FEITA de partes
    // conhecidas.
    expect(validarSenha("Nitz351642")).toBeNull();
    expect(validarSenha("Xk94027153")).toBeNull();
    // Mas uma sequencia obvia continua reprovada, mesmo com letras na frente.
    expect(validarSenha("Ab12345678")).not.toBeNull();
  });

  it("aceita frase longa que por acaso contem uma palavra obvia", () => {
    // Barrar toda senha que contenha "senha" rejeitaria justamente o tipo de
    // frase que se quer incentivar. O que condena e a senha ser FEITA de
    // partes previsiveis, nao conte-las.
    expect(validarSenha("cavalo senha grampo bateria")).toBeNull();
    expect(validarSenha("o estoque do tiago na bancada")).toBeNull();
  });
});

describe("criação de conta", () => {
  it("cria e nunca devolve a senha", async () => {
    const endereco = email("novo");
    const criado = await criarUsuario(
      {
        name: "Pessoa de teste",
        email: endereco,
        role: Role.EMPLOYEE,
        senha: "uma senha bem longa",
      },
      ctx,
    );

    const usuario = await prisma.user.findUniqueOrThrow({
      where: { id: criado.id },
      select: { email: true, role: true, passwordHash: true, active: true },
    });

    expect(usuario.email).toBe(endereco.toLowerCase());
    expect(usuario.role).toBe(Role.EMPLOYEE);
    expect(usuario.active).toBe(true);
    // O hash não pode conter a senha em claro.
    expect(usuario.passwordHash).not.toContain("uma senha");
    expect(usuario.passwordHash.startsWith("$2")).toBe(true);
  });

  it("recusa e-mail repetido", async () => {
    const endereco = email("repetido");
    await criarUsuario(
      { name: "Primeiro", email: endereco, role: Role.VIEWER, senha: "senha longa aqui" },
      ctx,
    );

    await expect(
      criarUsuario(
        { name: "Segundo", email: endereco, role: Role.VIEWER, senha: "outra senha longa" },
        ctx,
      ),
    ).rejects.toBeInstanceOf(ConflitoError);
  });

  it("recusa senha fraca antes de gravar", async () => {
    await expect(
      criarUsuario(
        { name: "Fraca", email: email("fraca"), role: Role.VIEWER, senha: "123456" },
        ctx,
      ),
    ).rejects.toBeInstanceOf(RegraDeNegocioError);
  });

  it("a senha nunca entra na trilha de auditoria", async () => {
    // Auditoria é lida por administradores e exportada. Senha em claro ali
    // seria um vazamento silencioso e permanente.
    const endereco = email("auditoria");
    const criado = await criarUsuario(
      { name: "Auditada", email: endereco, role: Role.VIEWER, senha: "senha secreta longa" },
      ctx,
    );

    const eventos = await prisma.auditLog.findMany({
      where: { entity: "User", entityId: criado.id },
      select: { before: true, after: true },
    });

    const texto = JSON.stringify(eventos);
    expect(texto).not.toContain("senha secreta longa");
    expect(texto).toContain(endereco.toLowerCase());
  });
});

describe("nunca ficar sem administrador", () => {
  it("impede rebaixar a própria conta", async () => {
    // Quem se rebaixa perde o acesso que precisaria para desfazer o erro.
    await expect(
      alterarPapel(ctx.userId, Role.VIEWER, ctx),
    ).rejects.toBeInstanceOf(RegraDeNegocioError);
  });

  it("impede desativar a própria conta", async () => {
    await expect(definirAtivo(ctx.userId, false, ctx)).rejects.toBeInstanceOf(
      RegraDeNegocioError,
    );
  });

  it("impede rebaixar o último administrador ativo", async () => {
    const outroAdmin = await criarUsuario(
      {
        name: "Admin temporário",
        email: email("admin"),
        role: Role.ADMIN,
        senha: "senha comprida do admin",
      },
      ctx,
    );

    // Com dois admins, rebaixar um é permitido.
    await alterarPapel(outroAdmin.id, Role.EMPLOYEE, ctx);

    const admins = await prisma.user.count({
      where: { role: Role.ADMIN, active: true },
    });
    expect(admins).toBeGreaterThanOrEqual(1);

    // Simula o cenário perigoso: se aquele fosse o último, a operação falha.
    const contexto: ActionContext = {
      ...ctx,
      userId: outroAdmin.id,
    };
    await expect(
      alterarPapel(ctx.userId, Role.VIEWER, contexto),
    ).rejects.toBeInstanceOf(RegraDeNegocioError);
  });
});

describe("troca de senha", () => {
  it("exige a senha atual", async () => {
    // Sem isso, quem achasse uma sessão aberta numa máquina destravada
    // trocaria a senha e tomaria a conta.
    const criado = await criarUsuario(
      { name: "Troca", email: email("troca"), role: Role.VIEWER, senha: "senha original longa" },
      ctx,
    );
    const contexto: ActionContext = { ...ctx, userId: criado.id };

    await expect(
      trocarPropriaSenha(
        { senhaAtual: "senha errada", novaSenha: "senha nova bem longa" },
        contexto,
      ),
    ).rejects.toBeInstanceOf(RegraDeNegocioError);

    await trocarPropriaSenha(
      { senhaAtual: "senha original longa", novaSenha: "senha nova bem longa" },
      contexto,
    );

    const depois = await prisma.user.findUniqueOrThrow({
      where: { id: criado.id },
      select: { passwordHash: true },
    });
    expect(depois.passwordHash).not.toContain("senha nova");
  });

  it("recusa repetir a senha atual", async () => {
    const criado = await criarUsuario(
      { name: "Repetida", email: email("repete"), role: Role.VIEWER, senha: "mesma senha longa" },
      ctx,
    );
    const contexto: ActionContext = { ...ctx, userId: criado.id };

    await expect(
      trocarPropriaSenha(
        { senhaAtual: "mesma senha longa", novaSenha: "mesma senha longa" },
        contexto,
      ),
    ).rejects.toBeInstanceOf(RegraDeNegocioError);
  });

  it("administrador redefine sem saber a senha antiga", async () => {
    // É o caso de uso: a pessoa esqueceu, ou a senha vazou.
    const criado = await criarUsuario(
      { name: "Esquecida", email: email("reset"), role: Role.EMPLOYEE, senha: "senha esquecida longa" },
      ctx,
    );

    const antes = await prisma.user.findUniqueOrThrow({
      where: { id: criado.id },
      select: { passwordHash: true },
    });

    await redefinirSenha(criado.id, "senha redefinida longa", ctx);

    const depois = await prisma.user.findUniqueOrThrow({
      where: { id: criado.id },
      select: { passwordHash: true },
    });
    expect(depois.passwordHash).not.toBe(antes.passwordHash);
  });
});
