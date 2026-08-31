/**
 * Normalização da connection string do PostgreSQL.
 *
 * Sem `server-only`: o seed, o script de diagnóstico e o `prisma.config.ts`
 * rodam fora do Next e precisam das mesmas regras.
 *
 * Existe porque a URL que os provedores entregam quase nunca é a que se quer
 * usar como está, e corrigir isso à mão no `.env.local` não funciona: o
 * `vercel env pull` sobrescreve o arquivo a cada execução.
 */

/**
 * Ajusta o modo SSL para `verify-full`.
 *
 * O `pg-connection-string` já trata `require`, `prefer` e `verify-ca` como
 * `verify-full`, mas emite um aviso de depreciação a cada conexão. Sendo
 * explícito, o aviso some e a intenção fica registrada — verificação completa
 * do certificado, que os provedores gerenciados (Neon, Supabase) suportam por
 * terem certificado público válido.
 */
export function normalizarUrlPostgres(url: string): string {
  try {
    const parsed = new URL(url);
    const modo = parsed.searchParams.get("sslmode");

    if (modo && modo !== "verify-full" && modo !== "disable") {
      parsed.searchParams.set("sslmode", "verify-full");
    }

    // Provedores que hibernam (Neon) levam alguns segundos para acordar. O
    // padrao do driver e curto demais e derruba a primeira conexao do dia.
    const timeout = Number(parsed.searchParams.get("connect_timeout") ?? 0);
    if (!Number.isFinite(timeout) || timeout < 15) {
      parsed.searchParams.set("connect_timeout", "15");
    }

    return parsed.toString();
  } catch {
    // URL malformada: devolve como veio para o erro aparecer na conexão, com
    // mensagem do driver, em vez de sumir aqui.
    return url;
  }
}

/**
 * Lê o schema alvo da URL.
 *
 * O driver `pg` ignora `?schema=`; quem o interpreta é o adapter do Prisma.
 * Permite instalar o sistema em um schema dedicado de um banco compartilhado.
 */
export function lerSchema(url: string): string {
  try {
    return new URL(url).searchParams.get("schema") ?? "public";
  } catch {
    return "public";
  }
}

/**
 * URL usada pelas migrations.
 *
 * Prefere a conexão direta (não-pooled) quando ela existe. O pooler do Neon é
 * PgBouncer em *transaction mode*, onde os advisory locks que o Prisma Migrate
 * usa para serializar migrations não se comportam de forma confiável — a
 * migration pode rodar duas vezes ou travar. A aplicação continua usando a
 * conexão pooled, que é o certo para tráfego normal.
 */
export function urlDeMigracao(): string | undefined {
  const direta =
    process.env.DATABASE_URL_UNPOOLED ?? process.env.POSTGRES_URL_NON_POOLING;
  const url = direta ?? process.env.DATABASE_URL;
  return url ? normalizarUrlPostgres(url) : undefined;
}
