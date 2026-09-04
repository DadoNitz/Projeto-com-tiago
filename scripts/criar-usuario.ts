/**
 * Cria ou redefine a senha de uma conta, por linha de comando.
 *
 * O caminho normal é a tela `/configuracoes/usuarios`. Este script existe para
 * o caso em que a tela não está disponível:
 *
 * - o primeiro acesso, quando ainda não há nenhuma conta;
 * - a recuperação, quando o único administrador perdeu a senha e portanto não
 *   consegue entrar para se redefinir.
 *
 * Sem isso, esses dois cenários só se resolveriam com SQL direto no banco.
 *
 * Uso:
 *   npm run usuario -- --nome "Tiago" --email tiago@estoque.local --perfil EMPLOYEE
 *
 * A senha é lida da variável SENHA, para não ficar no histórico do terminal:
 *   SENHA='...' npm run usuario -- --nome ... --email ...
 */
import { hash } from "bcryptjs";

import { CUSTO_HASH, validarSenha } from "../src/domain/auth/password";
import { prisma } from "../prisma/seed/client";

type Perfil = "ADMIN" | "EMPLOYEE" | "VIEWER";

function argumento(nome: string): string | undefined {
  const indice = process.argv.indexOf(`--${nome}`);
  return indice > -1 ? process.argv[indice + 1] : undefined;
}

async function main() {
  const nome = argumento("nome");
  const email = argumento("email")?.toLowerCase().trim();
  const perfil = (argumento("perfil") ?? "EMPLOYEE") as Perfil;
  const senha = process.env.SENHA;

  if (!nome || !email) {
    console.error(
      'Uso: SENHA=\'...\' npm run usuario -- --nome "Nome" --email pessoa@dominio --perfil EMPLOYEE',
    );
    process.exitCode = 1;
    return;
  }

  if (!senha) {
    console.error(
      "Defina a senha na variável SENHA, para ela não ficar no histórico do terminal.",
    );
    process.exitCode = 1;
    return;
  }

  if (!["ADMIN", "EMPLOYEE", "VIEWER"].includes(perfil)) {
    console.error("Perfil precisa ser ADMIN, EMPLOYEE ou VIEWER.");
    process.exitCode = 1;
    return;
  }

  const erro = validarSenha(senha);
  if (erro) {
    console.error(erro);
    process.exitCode = 1;
    return;
  }

  const passwordHash = await hash(senha, CUSTO_HASH);
  const existente = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true },
  });

  if (existente) {
    await prisma.user.update({
      where: { id: existente.id },
      data: { passwordHash, active: true, role: perfil },
    });
    console.log(`Senha redefinida e conta reativada: ${email} (${perfil})`);
  } else {
    await prisma.user.create({
      data: { name: nome, email, role: perfil, passwordHash },
    });
    console.log(`Conta criada: ${nome} · ${email} · ${perfil}`);
  }

  const contas = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { role: "asc" }],
    select: { name: true, email: true, role: true, active: true },
  });

  console.log("\nContas no sistema:");
  for (const conta of contas) {
    console.log(
      `  ${conta.name.padEnd(16)} ${conta.email.padEnd(26)} ${conta.role.padEnd(9)} ${conta.active ? "ativa" : "desativada"}`,
    );
  }
}

main()
  .catch((erro) => {
    console.error("Falhou:", erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
