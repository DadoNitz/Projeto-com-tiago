/* eslint-disable */
/**
 * Service Worker do Estoque de Hardware.
 *
 * Escrito a mao, e nao gerado por biblioteca, por dois motivos:
 *
 * 1. O @serwist/next depende de @serwist/webpack-plugin, e o Next 16 usa
 *    Turbopack por padrao -- o worker simplesmente nao seria gerado.
 * 2. A estrategia de cache aqui e deliberadamente minima. Ela precisa ser
 *    auditavel linha a linha, porque o Cache Storage e por ORIGEM e nao por
 *    usuario: cachear a resposta de uma rota autenticada vazaria dados de um
 *    usuario para outro na mesma maquina.
 *
 * Regras (docs/00-ANALISE-E-RISCOS.md secao 7):
 * - Apenas GET de mesma origem entram em cache.
 * - Apenas assets estaticos e versionados sao cacheados.
 * - Nenhuma resposta de /api/ e cacheada, nunca.
 * - Nenhum HTML de rota autenticada e cacheado.
 * - Navegacao offline cai numa pagina estatica de aviso, sem dado de usuario.
 */

// Trocar esta versao invalida todos os caches antigos no activate.
const CACHE_VERSION = "v2";
const STATIC_CACHE = `estoque-static-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";

const PRECACHE_URLS = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // addAll falha inteiro se um item falhar; aqui um icone ausente nao
      // pode impedir a instalacao do worker.
      await Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)));
      // Sem skipWaiting automatico: o worker novo espera. Quem decide ativar
      // e o usuario, pela mensagem "Nova versao disponivel" na interface.
      // Trocar assets sob os pes de alguem no meio de um cadastro perde dados.
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(
        nomes
          .filter((nome) => nome.startsWith("estoque-") && nome !== STATIC_CACHE)
          .map((nome) => caches.delete(nome)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Assets versionados/imutaveis: seguros para cache-first. */
function ehAssetEstatico(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest"
  );
}

/** Rotas que nunca podem ser cacheadas nem servidas de cache. */
function ehSensivel(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/image") ||
    url.pathname.startsWith("/login")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Mutacoes nunca passam pelo worker: uma operacao de estoque so vale com
  // confirmacao do servidor (secao 33).
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (ehSensivel(url)) return;

  if (ehAssetEstatico(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(navegacao(request));
    return;
  }

  // Todo o resto: rede direta, sem cache.
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cacheada = await cache.match(request);
  if (cacheada) return cacheada;

  const resposta = await fetch(request);
  if (resposta.ok && resposta.status === 200) {
    cache.put(request, resposta.clone());
  }
  return resposta;
}

/**
 * Navegacao sempre vai a rede. O HTML NAO e guardado: paginas autenticadas
 * carregam dados do usuario. Sem rede, mostramos a pagina de aviso.
 */
async function navegacao(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(STATIC_CACHE);
    const offline = await cache.match(OFFLINE_URL);
    return (
      offline ??
      new Response("Sem conexao.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}

/**
 * Notificacao push recebida.
 *
 * O corpo chega cifrado e e decifrado pelo proprio navegador com as chaves da
 * inscricao. Ainda assim nao mandamos dado sensivel: a notificacao diz o que
 * aconteceu e leva a tela; o detalhe fica atras do login.
 */
self.addEventListener("push", (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch {
    // Payload malformado nao pode impedir a notificacao de aparecer.
  }

  const titulo = dados.titulo || "Estoque de Hardware";

  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: dados.corpo || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      // A tag agrupa: um alerta novo substitui o anterior do mesmo assunto em
      // vez de empilhar cinco notificacoes na bandeja.
      tag: dados.tag || "estoque",
      data: { url: dados.url || "/dashboard" },
      lang: "pt-BR",
    }),
  );
});

/**
 * Toque na notificacao.
 *
 * Reaproveita uma aba ja aberta do sistema em vez de abrir outra: quem esta
 * com o app aberto no celular nao quer uma segunda instancia.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || "/dashboard";

  event.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const janela of janelas) {
        if (janela.url.includes(self.location.origin)) {
          await janela.focus();
          if ("navigate" in janela) await janela.navigate(destino);
          return;
        }
      }

      await self.clients.openWindow(destino);
    })(),
  );
});

self.addEventListener("message", (event) => {
  const tipo = event.data && event.data.type;

  // Disparado pelo botao "Atualizar" da interface.
  if (tipo === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  // Disparado no logout: nada do usuario anterior pode sobrar na maquina.
  if (tipo === "CLEAR_CACHES") {
    event.waitUntil(
      caches.keys().then((nomes) => Promise.all(nomes.map((n) => caches.delete(n)))),
    );
  }
});
