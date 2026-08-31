import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth/config";

/**
 * Primeira barreira de protecao das rotas.
 *
 * Convencao `proxy` do Next 16 (sucessora de `middleware`).
 *
 * Usa apenas `authConfig` (sem o provider Credentials) porque roda no runtime
 * Edge, onde bcryptjs e o Prisma nao carregam.
 *
 * Isto NAO substitui a autorizacao por operacao: toda Server Action verifica
 * sessao e permissao de novo, no servidor (secao 21).
 */
export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    /*
     * Tudo, menos:
     * - rotas do proprio Auth.js
     * - assets do Next e arquivos estaticos
     * - o service worker e o manifest (precisam ser publicos para o PWA
     *   instalar e atualizar mesmo com a sessao expirada)
     */
    "/((?!api/auth|_next/static|_next/image|favicon.ico|sw\.js|manifest\.webmanifest|icons/|offline).*)",
  ],
};
