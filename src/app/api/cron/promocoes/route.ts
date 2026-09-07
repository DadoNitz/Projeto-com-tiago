import { NextResponse } from "next/server";

import { coletarPromocoes, telegramConfigurado } from "@/server/services/telegram.service";

/**
 * Coleta de promocoes do Telegram, disparada pelo agendamento da Vercel.
 *
 * ## Por que aqui o segredo e obrigatorio
 *
 * A rota de alertas deixa passar quando CRON_SECRET nao esta definido. Aqui
 * nao: cada chamada consome cota de IA e cota de plano gratuito acaba. Uma
 * rota aberta seria um botao publico de queimar a cota do dia.
 *
 * Sem o segredo configurado a rota responde 503, e nao 401: o problema nao e
 * de quem chamou, e da instalacao.
 *
 * ## Horario
 *
 * "0 12 * * *" em UTC — 9h em Sao Paulo, uma vez ao dia. A cota gratuita de
 * IA e diaria e pequena; mais passadas nao caberiam, e o plano Hobby da
 * Vercel so permite uma execucao diaria de qualquer forma. O botao "Buscar
 * ofertas" na tela cobre a urgencia; o offset guardado faz as duas vias
 * conviverem sem reprocessar nada.
 */
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;

  if (!segredo) {
    return NextResponse.json(
      { erro: "CRON_SECRET nao configurado; a coleta fica desativada." },
      { status: 503 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "Nao autorizado." }, { status: 401 });
  }

  // Sem bot configurado nao ha o que coletar. Responder 200 e proposital: a
  // instalacao esta apenas incompleta, e um erro faria o painel da Vercel
  // acusar falha todo dia por uma escolha do usuario.
  if (!telegramConfigurado()) {
    return NextResponse.json({
      coletadoEm: new Date().toISOString(),
      ignorado: "TELEGRAM_BOT_TOKEN nao configurado.",
    });
  }

  try {
    const resultado = await coletarPromocoes();
    return NextResponse.json({
      coletadoEm: new Date().toISOString(),
      ...resultado,
    });
  } catch (erro) {
    // O agendamento nao tem ninguem olhando: o log e a unica testemunha.
    console.error("[cron/promocoes] falha na coleta:", erro);
    return NextResponse.json(
      {
        erro: "Falha na coleta.",
        detalhe: erro instanceof Error ? erro.message : String(erro),
      },
      { status: 500 },
    );
  }
}
