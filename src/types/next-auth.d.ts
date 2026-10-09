import type { DefaultSession } from "next-auth";

import type { Role } from "@/generated/prisma/enums";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    /** "Manter conectado" marcado no login. */
    lembrar?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    role?: Role;
    lembrar?: boolean;
    /** Fim da sessão curta (ms), quando "Manter conectado" não foi marcado. */
    expiraEm?: number;
  }
}

export {};
