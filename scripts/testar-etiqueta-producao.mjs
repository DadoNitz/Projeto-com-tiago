/**
 * Testa /api/etiqueta em producao: gera uma etiqueta, envia por multipart e
 * confere a extracao. Build passar nao prova que a rota funciona com a chave
 * e o storage reais do ambiente.
 */
import dnsPromises from "node:dns/promises";
import { Agent, setGlobalDispatcher } from "undici";
import sharp from "sharp";

const base = process.argv[2] || "http://localhost:3000";

const publico = new dnsPromises.Resolver();
publico.setServers(["1.1.1.1", "8.8.8.8"]);
setGlobalDispatcher(
  new Agent({
    connect: {
      lookup(hostname, opcoes, callback) {
        const responder = (e) =>
          opcoes.all ? callback(null, e) : callback(null, e[0].address, e[0].family);
        dnsPromises
          .lookup(hostname, { ...opcoes, all: true })
          .then(responder)
          .catch(async () => {
            try {
              const ips = await publico.resolve4(hostname);
              responder(ips.map((address) => ({ address, family: 4 })));
            } catch (erro) {
              callback(erro, "", 4);
            }
          });
      },
    },
  }),
);

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
console.log("[1] autenticado em", base);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="330">
  <rect width="900" height="330" fill="#efefec"/>
  <rect x="16" y="16" width="868" height="298" fill="#fff" stroke="#111" stroke-width="3"/>
  <text x="44" y="88" font-family="Arial" font-size="42" font-weight="bold">SEAGATE BARRACUDA</text>
  <text x="44" y="146" font-family="Arial" font-size="32">1TB  SATA 6Gb/s  7200RPM  3.5in</text>
  <text x="44" y="196" font-family="Arial" font-size="28">P/N: ST1000DM010</text>
  <text x="44" y="244" font-family="Arial" font-size="28">S/N: ZDN1TB4402</text>
</svg>`;
const foto = await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
console.log("[2] etiqueta gerada:", foto.byteLength, "bytes");

// Descobre a categoria "Armazenamento" pela propria listagem do sistema.
const corpo = new FormData();
corpo.append("foto", new Blob([foto], { type: "image/jpeg" }), "etiqueta.jpg");

const inicio = Date.now();
const r = await req("/api/etiqueta", { method: "POST", body: corpo });
const dados = await r.json();

console.log("[3] /api/etiqueta ->", r.status, "em", Date.now() - inicio, "ms");
if (!r.ok) {
  console.error("FALHA:", dados.erro);
  process.exit(1);
}

const s = dados.sugestao;
console.log("    categoria sugerida:", s.categorySlug ?? "(nao lida)");
console.log("    marca             :", s.marca ?? "(nao lida)");
console.log("    part number       :", s.partNumber ?? "(nao lido)");
console.log("    numero de serie   :", s.numeroSerie ?? "(nao lido)");
console.log("    nome sugerido     :", s.nomeSugerido ?? "(nao lido)");

const ok =
  (s.marca || "").toLowerCase().includes("seagate") &&
  (s.numeroSerie || "").includes("ZDN1TB4402");
console.log(ok ? "\nLeitura correta em producao." : "\nExtracao divergiu do esperado.");
process.exit(ok ? 0 : 1);
