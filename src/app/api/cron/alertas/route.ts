import { NextResponse } from "next/server";

import { verificarEAvisar } from "@/server/services/push.service";

/**
 * Checagem diaria do estoque, disparada pelo agendamento da Vercel.
 *
 * Nao usa a sessao do usuario porque nao ha usuario: quem chama e o
 * agendador. A autorizacao e por segredo compartilhado no cabecalho, que a
 * Vercel envia automaticamente quando CRON_SECRET esta definido.
 *
 * Sem essa verificacao a rota seria um gatilho publico de notificacao para
 * toda a equipe — qualquer pessoa com a URL poderia disparar spam.
 *
 * Horario: "0 11 * * *" no vercel.json, que e UTC. Da 8h em Sao Paulo, antes
 * do expediente — a pessoa abre o dia ja sabendo o que precisa de atencao.
 * (JSON nao aceita comentario, por isso a nota mora aqui.)
 */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;

  if (segredo) {
    const autorizacao = request.headers.get("authorization");
    if (autorizacao !== `Bearer ${segredo}`) {
      return NextResponse.json({ erro: "Nao autorizado." }, { status: 401 });
    }
  }

  const resultado = await verificarEAvisar();

  return NextResponse.json({
    verificadoEm: new Date().toISOString(),
    alertas: resultado.alertas,
    envio: resultado.envio,
  });
}
