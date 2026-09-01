import "server-only";

import webpush from "web-push";

import { prisma } from "@/server/db/client";

/**
 * Notificações push (seção 33).
 *
 * O conteúdo é cifrado com as chaves da própria inscrição: o serviço de push
 * do navegador (Google, Apple, Mozilla) transporta o pacote sem conseguir
 * lê-lo. Ainda assim, nada de dado sensível vai no corpo — a notificação diz
 * o que aconteceu e leva à tela; os detalhes ficam atrás do login.
 */

let configurado = false;

function configurar(): boolean {
  if (configurado) return true;

  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  const assunto = process.env.VAPID_SUBJECT ?? "mailto:admin@localhost";

  if (!publica || !privada) return false;

  webpush.setVapidDetails(assunto, publica, privada);
  configurado = true;
  return true;
}

export function pushDisponivel(): boolean {
  return configurar();
}

export interface DadosDaInscricao {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | undefined;
}

/**
 * Registra a inscrição de um navegador.
 *
 * A chave é o `endpoint`, não o usuário: a mesma pessoa costuma usar celular,
 * notebook e o navegador do trabalho, e cada um recebe suas notificações.
 */
export async function inscrever(
  dados: DadosDaInscricao,
  userId: string,
): Promise<void> {
  await prisma.pushSubscription.upsert({
    where: { endpoint: dados.endpoint },
    create: {
      userId,
      endpoint: dados.endpoint,
      p256dh: dados.p256dh,
      auth: dados.auth,
      userAgent: dados.userAgent ?? null,
    },
    // Endpoint reaproveitado por outra conta na mesma máquina precisa trocar
    // de dono, ou as notificações iriam para a pessoa errada.
    update: { userId, p256dh: dados.p256dh, auth: dados.auth },
  });
}

export async function desinscrever(endpoint: string): Promise<void> {
  await prisma.pushSubscription
    .deleteMany({ where: { endpoint } })
    .catch(() => undefined);
}

export interface Notificacao {
  titulo: string;
  corpo: string;
  /** Para onde a notificação leva ao ser tocada. */
  url?: string;
  /**
   * Agrupa notificações do mesmo assunto.
   *
   * Sem isso, cinco alertas de estoque baixo viram cinco notificações na
   * bandeja. Com a mesma tag, a nova substitui a anterior.
   */
  tag?: string;
}

export interface ResultadoDoEnvio {
  enviadas: number;
  removidas: number;
  falhas: number;
}

/**
 * Envia para todos os dispositivos de um conjunto de usuários.
 *
 * Inscrições mortas (404/410) são removidas em vez de reenviadas: um
 * endpoint expirado nunca volta a funcionar, e insistir só gasta requisição e
 * enche o log de erro.
 */
export async function enviarNotificacao(
  notificacao: Notificacao,
  filtro: { userIds?: string[] } = {},
): Promise<ResultadoDoEnvio> {
  if (!configurar()) {
    return { enviadas: 0, removidas: 0, falhas: 0 };
  }

  const inscricoes = await prisma.pushSubscription.findMany({
    where: filtro.userIds ? { userId: { in: filtro.userIds } } : {},
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });

  const carga = JSON.stringify({
    titulo: notificacao.titulo,
    corpo: notificacao.corpo,
    url: notificacao.url ?? "/dashboard",
    tag: notificacao.tag ?? "estoque",
  });

  let enviadas = 0;
  let removidas = 0;
  let falhas = 0;
  const mortas: string[] = [];

  await Promise.all(
    inscricoes.map(async (inscricao) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: inscricao.endpoint,
            keys: { p256dh: inscricao.p256dh, auth: inscricao.auth },
          },
          carga,
          { TTL: 60 * 60 * 24 },
        );
        enviadas += 1;
      } catch (erro) {
        const status = (erro as { statusCode?: number }).statusCode;

        if (status === 404 || status === 410) {
          mortas.push(inscricao.id);
          removidas += 1;
          return;
        }

        falhas += 1;
        console.error("[push] falha ao enviar:", status, erro);
      }
    }),
  );

  if (mortas.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: mortas } } });
  }

  if (enviadas > 0) {
    await prisma.pushSubscription.updateMany({
      where: { id: { in: inscricoes.map((i) => i.id) } },
      data: { lastUsedAt: new Date() },
    });
  }

  return { enviadas, removidas, falhas };
}

/**
 * Verifica o estoque e avisa o que precisa de atenção.
 *
 * Chamada pelo agendamento diário. Só notifica quando há de fato algo a
 * dizer: notificação sem conteúdo útil ensina o usuário a ignorá-las, e aí
 * ele perde a que importava.
 */
export async function verificarEAvisar(): Promise<{
  alertas: string[];
  envio: ResultadoDoEnvio | null;
}> {
  const alertas: string[] = [];

  const [produtosBaixos, defeituosos, reservadasAntigas] = await Promise.all([
    prisma.product.findMany({
      where: { lowStockThreshold: { gt: 0 } },
      select: {
        name: true,
        lowStockThreshold: true,
        units: { where: { status: "AVAILABLE" }, select: { quantity: true } },
      },
    }),

    prisma.inventoryUnit.count({ where: { status: "DEFECTIVE" } }),

    prisma.inventoryUnit.count({
      where: {
        status: "RESERVED",
        // Reserva parada há mais de 15 dias costuma ser cliente que sumiu, e
        // a peça está fora do estoque disponível sem estar rendendo nada.
        updatedAt: {
          lte: new Date(Date.now() - 15 * 86_400_000),
        },
      },
    }),
  ]);

  const abaixoDoMinimo = produtosBaixos.filter((produto) => {
    const disponiveis = produto.units.reduce(
      (soma, unidade) => soma + unidade.quantity,
      0,
    );
    return disponiveis < produto.lowStockThreshold;
  });

  if (abaixoDoMinimo.length > 0) {
    const nomes = abaixoDoMinimo
      .slice(0, 3)
      .map((produto) => produto.name)
      .join(", ");
    alertas.push(
      abaixoDoMinimo.length <= 3
        ? `Estoque baixo: ${nomes}.`
        : `Estoque baixo em ${abaixoDoMinimo.length} itens: ${nomes} e outros.`,
    );
  }

  if (defeituosos > 0) {
    alertas.push(
      `${defeituosos} peça(s) com defeito aguardando teste ou descarte.`,
    );
  }

  if (reservadasAntigas > 0) {
    alertas.push(
      `${reservadasAntigas} peça(s) reservadas há mais de 15 dias sem movimentação.`,
    );
  }

  if (alertas.length === 0) return { alertas: [], envio: null };

  // Só quem opera o estoque recebe: perfil de consulta não age sobre isso.
  const destinatarios = await prisma.user.findMany({
    where: { active: true, role: { in: ["ADMIN", "EMPLOYEE"] } },
    select: { id: true },
  });

  const envio = await enviarNotificacao(
    {
      titulo: "Estoque precisa de atenção",
      corpo: alertas.join(" "),
      url: "/dashboard",
      tag: "alerta-estoque",
    },
    { userIds: destinatarios.map((usuario) => usuario.id) },
  );

  return { alertas, envio };
}
