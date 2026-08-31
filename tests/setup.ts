import path from "node:path";

/**
 * Carrega o ambiente antes dos testes.
 *
 * Mesma ordem da aplicacao: .env.local vence sobre .env, porque
 * process.loadEnvFile nao sobrescreve variavel ja definida.
 */
for (const arquivo of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(process.cwd(), arquivo));
  } catch {
    // ausente e normal
  }
}
