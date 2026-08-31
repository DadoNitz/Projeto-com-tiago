/**
 * Diagnostico da conexao com o banco.
 *
 * Rodar:  npm run db:check
 *
 * Existe porque falha de conexao com Postgres gerenciado quase nunca diz o que
 * realmente esta errado: "ENOTFOUND" pode ser host errado, projeto pausado ou
 * DNS; "password authentication failed" pode ser senha com caractere especial
 * nao codificado. Este script separa esses casos.
 */
import dns from "node:dns/promises";
import path from "node:path";

import pg from "pg";

// Ordem importa: loadEnvFile NAO sobrescreve variavel ja definida, entao o
// primeiro arquivo vence. Reproduz a precedencia do Next.
for (const arquivo of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(process.cwd(), arquivo));
  } catch {
    // ausente e normal
  }
}

const bruto = process.env.DATABASE_URL;

if (!bruto) {
  console.error("DATABASE_URL nao definida. Copie .env.example para .env.local.");
  process.exit(1);
}

let url;
try {
  url = new URL(bruto);
} catch {
  console.error(
    "DATABASE_URL nao e uma URL valida.\n" +
      "Causa mais comum: a senha contem #, @, / ou ? sem percent-encoding.\n" +
      "Ex.: uma senha 'ab#cd' precisa aparecer como 'ab%23cd'.",
  );
  process.exit(1);
}

const schema = url.searchParams.get("schema") ?? "public";
const sslmode = url.searchParams.get("sslmode") ?? "(nao informado)";

console.log("host   :", url.hostname + ":" + (url.port || "5432"));
console.log("banco  :", url.pathname.replace(/^\//, ""));
console.log("usuario:", decodeURIComponent(url.username));
console.log("schema :", schema);
console.log("sslmode:", sslmode);
console.log("");

// 1) DNS
try {
  const { address } = await dns.lookup(url.hostname);
  console.log("[1/3] DNS resolvido:", address);
} catch (erro) {
  console.error("[1/3] DNS FALHOU:", erro.code);
  console.error(
    "      O host nao existe ou nao tem registro IPv4.\n" +
      "      Confira se copiou a connection string correta do painel.",
  );
  process.exit(1);
}

// 2) Conexao + autenticacao
const client = new pg.Client({
  connectionString: bruto,
  connectionTimeoutMillis: 15000,
});

try {
  await client.connect();
  console.log("[2/3] Conectado e autenticado.");
} catch (erro) {
  console.error("[2/3] CONEXAO FALHOU:", erro.code || "", erro.message);
  if (erro.code === "28P01") {
    console.error(
      "      Senha incorreta. Se ela tem caracteres especiais, confirme que\n" +
        "      esta percent-encoded na DATABASE_URL.",
    );
  }
  if (erro.code === "ETIMEDOUT" || erro.code === "ECONNREFUSED") {
    console.error("      Porta bloqueada, ou o banco esta pausado/hibernando.");
  }
  process.exit(1);
}

// 3) Permissoes efetivas
try {
  const versao = await client.query("select version() as v");
  console.log("[3/3]", String(versao.rows[0].v).split(",")[0]);

  await client.query(`create schema if not exists "${schema}"`);
  const podeCriar = await client.query(
    "select has_schema_privilege($1, 'CREATE') as pode",
    [schema],
  );
  console.log("      schema " + schema + ": criacao de tabelas =", podeCriar.rows[0].pode);

  const tabelas = await client.query(
    "select count(*)::int as n from information_schema.tables where table_schema = $1",
    [schema],
  );
  console.log("      tabelas ja existentes no schema:", tabelas.rows[0].n);

  console.log("\nBanco pronto. Proximo passo: npm run db:migrate");
} catch (erro) {
  console.error("[3/3] Sem permissao suficiente:", erro.message);
  process.exit(1);
} finally {
  await client.end();
}
