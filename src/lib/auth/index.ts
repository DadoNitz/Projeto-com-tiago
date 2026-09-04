import "server-only";

import { compare } from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { prisma } from "@/server/db/client";

import { authConfig } from "./config";
import { podeTentar, registrarFalha, registrarSucesso } from "./rate-limit";

const credenciaisSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Configuração completa do Auth.js (runtime Node).
 *
 * Sistema interno, sem cadastro público: autenticação por e-mail e senha
 * (seção 16). Senhas guardadas com bcrypt; a senha em claro nunca é
 * persistida nem registrada em log.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credenciaisSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        // Limite de tentativas antes de tocar o banco: um ataque de forca
        // bruta nao deve nem gerar consulta, quanto mais o custo do bcrypt.
        if (!podeTentar(email).permitido) return null;

        const usuario = await prisma.user.findUnique({
          where: { email: email.toLowerCase().trim() },
        });

        // Mesma resposta para "usuário não existe", "inativo" e "senha
        // errada": não entregamos ao atacante a informação de quais e-mails
        // estão cadastrados.
        if (!usuario || !usuario.active) {
          registrarFalha(email);
          return null;
        }

        const senhaConfere = await compare(password, usuario.passwordHash);
        if (!senhaConfere) {
          registrarFalha(email);
          return null;
        }

        registrarSucesso(email);

        await prisma.user.update({
          where: { id: usuario.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: usuario.id,
          email: usuario.email,
          name: usuario.name,
          role: usuario.role,
        };
      },
    }),
  ],
});
