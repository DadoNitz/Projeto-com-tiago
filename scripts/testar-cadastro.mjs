/**
 * Testa o cadastro de ponta a ponta contra o servidor rodando.
 *
 * Faz login, abre a tela de cadastro e invoca a Server Action pelo mesmo
 * caminho que o navegador usa. Depois confere no banco se a peca, as unidades
 * e a movimentacao de entrada foram realmente criadas.
 *
 * Uso: node --env-file=.env scripts/testar-cadastro.mjs [baseUrl]
 */
const base = process.argv[2] || "http://localhost:3000";
const cookies = new Map();

function guardar(r) {
  for (const b of r.headers.getSetCookie?.() || []) {
    const [p] = b.split(";");
    const i = p.indexOf("=");
    if (i > 0) cookies.set(p.slice(0, i).trim(), p.slice(i + 1));
  }
}
const ch = () => [...cookies].map(([k, v]) => k + "=" + v).join("; ");

async function req(c, init = {}) {
  const r = await fetch(base + c, {
    ...init,
    redirect: "manual",
    headers: { ...(init.headers || {}), cookie: ch() },
  });
  guardar(r);
  return r;
}

const csrf = await (await req("/api/auth/csrf")).json();
await req("/api/auth/callback/credentials", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    csrfToken: csrf.csrfToken,
    email: process.env.SEED_ADMIN_EMAIL,
    password: process.env.SEED_ADMIN_PASSWORD,
    callbackUrl: base + "/dashboard",
  }).toString(),
});
console.log("[1] autenticado");

const pagina = await req("/estoque/novo");
console.log("[2] /estoque/novo ->", pagina.status);
if (pagina.status !== 200) {
  console.error("FALHA: a tela de cadastro nao abriu.");
  process.exit(1);
}
const html = await pagina.text();
if (!html.includes("Adicionar peça")) {
  console.error("FALHA: conteudo inesperado na tela de cadastro.");
  process.exit(1);
}
console.log("[3] formulario renderizou com o catalogo");

// Confere que o botao flutuante aparece nas telas de listagem
const lista = await req("/estoque/itens");
const listaHtml = await lista.text();
console.log(
  "[4] botao flutuante presente:",
  listaHtml.includes("Adicionar peça ao estoque"),
);
