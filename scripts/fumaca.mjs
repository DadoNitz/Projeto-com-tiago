/**
 * Teste de fumaca: faz login de verdade e abre as paginas principais.
 *
 * Existe porque "compila" e "funciona" sao coisas diferentes. Erro de runtime
 * em Server Component so aparece quando a pagina e realmente renderizada com
 * dados do banco.
 *
 * Uso: node scripts/fumaca.mjs [baseUrl]
 */
import dnsPromises from "node:dns/promises";
import { Agent, setGlobalDispatcher } from "undici";

const base = process.argv[2] || "http://localhost:3000";

/**
 * Resolucao de nomes com fallback para DNS publico.
 *
 * O `fetch` do Node usa getaddrinfo, que depende do resolvedor do sistema.
 * Quando ele falha (cache corrompido, VPN, DNS do provedor instavel), o teste
 * acusaria "producao fora do ar" por um problema que e da maquina local.
 * Aqui, se o resolvedor do sistema falhar, tentamos Cloudflare e Google.
 */
const publico = new dnsPromises.Resolver();
publico.setServers(["1.1.1.1", "8.8.8.8"]);

setGlobalDispatcher(
  new Agent({
    connect: {
      lookup(hostname, opcoes, callback) {
        // O net.connect pede uma lista quando `all` esta ligado, e um par
        // (endereco, familia) quando nao esta. Devolver o formato errado
        // produz "Invalid IP address: undefined".
        const responder = (enderecos) =>
          opcoes.all
            ? callback(null, enderecos)
            : callback(null, enderecos[0].address, enderecos[0].family);

        dnsPromises
          .lookup(hostname, { ...opcoes, all: true })
          .then(responder)
          .catch(async () => {
            try {
              const encontrados = await publico.resolve4(hostname);
              if (encontrados.length === 0) throw new Error("sem registro A");
              console.warn("  (DNS do sistema falhou; resolvido via 1.1.1.1)");
              responder(encontrados.map((address) => ({ address, family: 4 })));
            } catch (erro) {
              callback(erro, "", 4);
            }
          });
      },
    },
  }),
);

let cookies = new Map();

function guardar(resposta) {
  const set = resposta.headers.getSetCookie?.() || [];
  for (const bruto of set) {
    const [par] = bruto.split(";");
    const idx = par.indexOf("=");
    if (idx > 0) cookies.set(par.slice(0, idx).trim(), par.slice(idx + 1));
  }
}

function cabecalho() {
  return [...cookies].map(([k, v]) => k + "=" + v).join("; ");
}

async function req(caminho, init = {}) {
  const resposta = await fetch(base + caminho, {
    ...init,
    redirect: "manual",
    headers: { ...(init.headers || {}), cookie: cabecalho() },
  });
  guardar(resposta);
  return resposta;
}

const email = process.env.SEED_ADMIN_EMAIL;
const senha = process.env.SEED_ADMIN_PASSWORD;
if (!email || !senha) {
  console.error("Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD.");
  process.exit(1);
}

// 1) CSRF
const csrfResp = await req("/api/auth/csrf");
const { csrfToken } = await csrfResp.json();
console.log("[1] csrf obtido");

// 2) login
const corpo = new URLSearchParams({
  csrfToken,
  email,
  password: senha,
  callbackUrl: base + "/dashboard",
});
const login = await req("/api/auth/callback/credentials", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: corpo.toString(),
});
console.log("[2] login ->", login.status, login.headers.get("location") || "");

const autenticado = [...cookies.keys()].some((c) =>
  c.includes("session-token"),
);
if (!autenticado) {
  console.error("FALHOU: nenhum cookie de sessao foi emitido.");
  process.exit(1);
}
console.log("[3] sessao criada");

// 3) paginas
const rotas = [
  "/dashboard",
  "/estoque/itens",
  "/estoque/itens?q=3060",
  "/estoque/itens?status=AVAILABLE&ordenacao=valor-maior",
  "/socios",
  "/montagens",
  "/montagens/minhas",
  "/estoque/novo",
  "/estoque/movimentacoes",
  "/estoque/ler",
  "/estoque/etiquetas",
  "/inteligencia",
  "/inteligencia/analise",
  "/relatorios",
  "/relatorios?periodo=ano",
  "/mais",
  "/api/health",
];

let falhas = 0;
for (const rota of rotas) {
  const r = await req(rota);
  const html = r.status === 200 ? await r.text() : "";
  const erroReact = html.includes("__next_error__") || html.includes("Application error");
  const ok = (r.status === 200 || r.status === 204) && !erroReact;
  if (!ok) falhas++;
  console.log(
    (ok ? "  OK  " : "  FALHA ") + rota.padEnd(46),
    r.status,
    erroReact ? "(erro de runtime na pagina)" : "",
  );
}

// 4) detalhe de uma unidade real
const lista = await req("/estoque/itens");
const html = await lista.text();
const m = html.match(/\/estoque\/itens\/([a-z0-9]{20,})/i);
if (m) {
  const r = await req("/estoque/itens/" + m[1]);
  const corpoHtml = r.status === 200 ? await r.text() : "";
  const erro = corpoHtml.includes("__next_error__");
  if (r.status !== 200 || erro) falhas++;
  console.log(
    ((r.status === 200 && !erro) ? "  OK  " : "  FALHA ") +
      ("/estoque/itens/" + m[1].slice(0, 8) + "...").padEnd(46),
    r.status,
  );
} else {
  console.log("  AVISO  nao encontrei link de unidade na listagem");
}

console.log(falhas === 0 ? "\nTudo respondeu." : "\n" + falhas + " rota(s) com problema.");
process.exit(falhas === 0 ? 0 : 1);
