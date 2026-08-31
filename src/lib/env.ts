import "server-only";

import { z } from "zod";

/**
 * Validação das variáveis de ambiente do servidor.
 *
 * Importa `server-only`: se algum componente de cliente tentar importar este
 * módulo, o build quebra. É a garantia estrutural de que segredos (chaves de
 * IA, string de conexão) nunca chegam ao navegador — exigência da seção 21.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL é obrigatória. Copie .env.example para .env.local."),

  AUTH_SECRET: z
    .string()
    .min(
      32,
      "AUTH_SECRET precisa de pelo menos 32 caracteres. Gere com: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    ),

  /**
   * Onde as imagens ficam.
   *
   * Sem padrao aqui de proposito: o valor certo depende do ambiente, e um
   * default fixo esconderia o erro mais caro possivel — usar disco local em
   * producao, onde o filesystem da Vercel e somente leitura e o upload
   * falharia so na hora que alguem tirasse uma foto.
   */
  STORAGE_DRIVER: z
    .enum(["local", "vercel-blob", "s3", "r2", "supabase"])
    .optional(),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  UPLOAD_MAX_MB: z.coerce.number().int().positive().max(100).default(15),

  // Opcionais: o sistema funciona inteiro sem IA. Sem chave, os recursos que
  // dependem dela ficam escondidos, em vez de aparecerem e falharem.
  AI_PROVIDER: z.enum(["anthropic", "openai", "gemini"]).default("gemini"),
  // Modelo fixo, nunca "latest": um modelo que muda sozinho altera o
  // comportamento da leitura de etiqueta sem ninguem ter mexido em codigo.
  AI_MODEL: z.string().default("gemini-3.6-flash"),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema> & {
  STORAGE_DRIVER: NonNullable<z.infer<typeof serverEnvSchema>["STORAGE_DRIVER"]>;
};

function loadEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const detalhes = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Configuração de ambiente inválida:\n${detalhes}\n\nVerifique o arquivo .env.local.`,
    );
  }

  const dados = parsed.data;

  // Producao usa Blob; desenvolvimento usa disco. Escolha explicita continua
  // valendo, para quem quiser testar o Blob localmente.
  const driver =
    dados.STORAGE_DRIVER ??
    (dados.NODE_ENV === "production" ? "vercel-blob" : "local");

  return { ...dados, STORAGE_DRIVER: driver };
}

let cached: ServerEnv | null = null;

/**
 * Acesso preguiçoso e memoizado. Preguiçoso de propósito: valida na primeira
 * utilização real, e não no momento em que o módulo é importado — assim
 * comandos que não tocam o banco (lint, build de tipos) não exigem um .env
 * completo.
 */
export function env(): ServerEnv {
  cached ??= loadEnv();
  return cached;
}
