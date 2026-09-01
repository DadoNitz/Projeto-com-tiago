/**
 * Testa a rota do agendamento diario em producao.
 *
 * Verifica as tres situacoes que importam: sem autorizacao, com segredo
 * errado e com o segredo certo. As duas primeiras precisam devolver 401 — sem
 * isso a rota seria um gatilho publico de notificacao para toda a equipe.
 *
 * Uso: npm run cron:check [-- https://outra-url]
 */
import dns from "node:dns/promises";

import { Agent, setGlobalDispatcher } from "undici";

// Fallback de DNS: o resolvedor do sistema falha em algumas maquinas para o
// dominio vercel.app, e o teste acusaria producao fora do ar por um problema
// que e local.
const publico = new dns.Resolver();
publico.setServers(["1.1.1.1", "8.8.8.8"]);

setGlobalDispatcher(
  new Agent({
    connect: {
      lookup(hostname, opcoes, callback) {
        const responder = (enderecos) =>
          opcoes.all
            ? callback(null, enderecos)
            : callback(null, enderecos[0].address, enderecos[0].family);

        dns
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

const base = process.argv[2] || "https://estoque-hardware.vercel.app";
const segredo = process.env.CRON_SECRET;

if (!segredo) {
  console.error("CRON_SECRET nao definido no ambiente.");
  process.exit(1);
}

let falhas = 0;

function conferir(rotulo, recebido, esperado) {
  const ok = recebido === esperado;
  if (!ok) falhas += 1;
  console.log(
    `${ok ? "  OK  " : "  FALHA "}${rotulo.padEnd(28)} ${recebido} (esperado ${esperado})`,
  );
}

const semAuth = await fetch(`${base}/api/cron/alertas`);
conferir("sem autorizacao", semAuth.status, 401);

const segredoErrado = await fetch(`${base}/api/cron/alertas`, {
  headers: { authorization: "Bearer errado" },
});
conferir("com segredo errado", segredoErrado.status, 401);

const autorizado = await fetch(`${base}/api/cron/alertas`, {
  headers: { authorization: `Bearer ${segredo}` },
});
conferir("com o segredo certo", autorizado.status, 200);

if (autorizado.ok) {
  const dados = await autorizado.json();
  console.log("\nAlertas encontrados:");
  if (dados.alertas.length === 0) {
    console.log("  (nenhum — nada exigindo atencao no estoque)");
  } else {
    for (const alerta of dados.alertas) console.log("  -", alerta);
  }
  if (dados.envio) {
    console.log(
      `\nNotificacoes: ${dados.envio.enviadas} enviadas, ` +
        `${dados.envio.removidas} inscricoes mortas removidas, ` +
        `${dados.envio.falhas} falhas.`,
    );
  } else {
    console.log("\nNenhuma notificacao enviada (sem alertas).");
  }
}

process.exit(falhas === 0 ? 0 : 1);
