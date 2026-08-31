import type { NextAuthConfig } from "next-auth";

import type { Role } from "@/generated/prisma/enums";

/**
 * Configuração compartilhada do Auth.js, deliberadamente livre de qualquer
 * dependência que não rode no runtime Edge.
 *
 * O middleware roda no Edge e não consegue carregar `bcryptjs` nem o Prisma.
 * Por isso a configuração é dividida: este arquivo (leve, importado pelo
 * middleware) e `src/lib/auth/index.ts` (completo, com o provider Credentials
 * que consulta o banco).
 */
export const authConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  trustHost: true,
  providers: [],
  callbacks: {
    /**
     * O papel do usuário viaja dentro do JWT. Evita uma consulta ao banco em
     * toda requisição só para descobrir permissões.
     */
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: Role }).role;
        token.userId = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.userId as string | undefined) ?? "";
        session.user.role = token.role as Role;
      }
      return session;
    },
    /**
     * Primeira barreira: protege as rotas. Não é a única — toda Server Action
     * autoriza de novo no servidor (seção 21). Middleware sozinho já foi fonte
     * de bypass em outros sistemas; aqui ele é conveniência, não garantia.
     */
    authorized({ auth, request }) {
      const logado = Boolean(auth?.user);
      const { pathname } = request.nextUrl;

      const rotaPublica =
        pathname === "/login" ||
        pathname.startsWith("/api/auth") ||
        // Checagem de alcançabilidade do servidor. Precisa responder mesmo com
        // a sessão expirada: se redirecionasse para o login, o indicador de
        // conexão receberia HTML em vez de 204 e declararia o app offline —
        // exatamente o erro que a seção 33 manda evitar. Não revela nada.
        pathname === "/api/health" ||
        pathname === "/manifest.webmanifest" ||
        pathname === "/sw.js" ||
        pathname === "/offline";

      if (rotaPublica) return true;
      return logado;
    },
  },
} satisfies NextAuthConfig;
