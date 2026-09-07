import "server-only";

import { valeChamarIA } from "@/domain/promotions/pre-filtro";
import { prisma } from "@/server/db/client";
import { contextoDoSistema } from "@/server/ator";

import { extrairPromocao } from "./deal-parser.service";
import { enviarNotificacao } from "./push.service";
import { avaliarPromocao, registrarPromocao } from "./promotion.service";

/**
 * Entrada de promoções pelo Telegram.
 *
 * ## Por que Telegram, e não raspagem de sites
 *
 * A especificação (seção 26) proíbe scraping ilegal, e com razão: raspar loja
 * viola os termos dela, rende bloqueio de IP e quebra a cada mudança de
 * layout. O Telegram tem API oficial feita para isto.
 *
 * ## A regra que define o desenho
 *
 * Um bot **só lê mensagens de grupos onde foi adicionado**. Não existe ler
 * canal alheio — e isso é bom, porque o caminho legítimo também é o mais
 * útil: você cria um grupo seu, adiciona o bot, e encaminha para lá as
 * ofertas que valem a pena de qualquer grupo que já acompanhe.
 *
 * Um humano filtra antes, o sistema faz o trabalho chato: extrair, comparar
 * com o que você realmente pagou nas peças, e avisar quando for boa de
 * verdade.
 *
 * ## Cota
 *
 * Cada mensagem que passa do pré-filtro custa uma chamada de IA, e o plano
 * gratuito acaba rápido. Por isso há teto por ciclo: o excedente fica para o
 * próximo, e o `offset` não avança além do que foi processado.
 */

/**
 * Quantas mensagens processar por ciclo.
 *
 * O número vem da cota, não de um palpite: a camada gratuita do Gemini dá
 * poucas dezenas de requisições por dia *por modelo*, e a coleta roda uma vez
 * ao dia. Gastar tudo num ciclo deixaria o resto do dia sem margem para uma
 * coleta manual — que é justamente o que se usa quando acabou de chegar uma
 * oferta boa.
 *
 * O que passa do teto não se perde: o `offset` não avança além do processado,
 * e as mensagens voltam no ciclo seguinte.
 */
const MAXIMO_POR_CICLO = 10;

/**
 * Teto da coleta manual, menor que o do agendamento.
 *
 * A coleta manual roda dentro de uma Server Action, que tem limite de tempo.
 * Em sobrecarga o provedor repete a chamada até três vezes, e uma única
 * mensagem pode levar minutos — dez delas estourariam a função no meio, e a
 * pessoa veria um erro no lugar do resultado.
 *
 * Cortar cedo não perde nada: o `offset` só avança sobre o processado, e o
 * resto entra na próxima busca ou no agendamento.
 */
const MAXIMO_MANUAL = 4;

/** Chave onde guardamos o ponto de leitura, na tabela de configuração. */
const CHAVE_OFFSET = "telegram.ultimoUpdateId";

interface MensagemDoTelegram {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    text?: string;
    caption?: string;
    chat: { id: number; title?: string; type: string };
  };
  channel_post?: {
    message_id: number;
    date: number;
    text?: string;
    caption?: string;
    chat: { id: number; title?: string; type: string };
  };
}

export function telegramConfigurado(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

async function chamar<T>(metodo: string, params: Record<string, unknown> = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN não configurado.");

  const resposta = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(30_000),
  });

  const dados = (await resposta.json()) as {
    ok: boolean;
    result?: T;
    description?: string;
  };

  if (!dados.ok) {
    throw new Error(`Telegram recusou ${metodo}: ${dados.description ?? "sem motivo"}`);
  }

  return dados.result as T;
}

/** Confirma que o token funciona e diz qual bot é. Usado no diagnóstico. */
export async function verificarBot(): Promise<{ username: string }> {
  const eu = await chamar<{ username: string }>("getMe");
  return { username: eu.username };
}

async function lerOffset(): Promise<number> {
  const registro = await prisma.appSetting.findUnique({
    where: { key: CHAVE_OFFSET },
  });
  return registro ? Number(registro.value) || 0 : 0;
}

async function gravarOffset(valor: number): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: CHAVE_OFFSET },
    create: { key: CHAVE_OFFSET, value: String(valor) },
    update: { value: String(valor) },
  });
}

export { MAXIMO_MANUAL };

export interface ResultadoDaColeta {
  lidas: number;
  descartadasSemCusto: number;
  promocoesNovas: number;
  duplicadas: number;
  erros: number;
  /** Ofertas que a IA considerou boas, já avaliadas contra o custo real. */
  boas: { titulo: string; preco: number; nota: number }[];
  /** Descartadas pela IA: custaram cota, mas não eram oferta de informática. */
  descartadasPelaIA: number;
  /** Ficaram para o próximo ciclo por causa do teto. */
  adiadas: number;
}

/**
 * Lê as mensagens novas e registra as ofertas.
 *
 * O `offset` só avança até onde foi de fato processado. Se o ciclo parar no
 * meio — cota estourada, erro de rede — as mensagens restantes voltam no
 * próximo, em vez de se perderem.
 */
export async function coletarPromocoes(
  { teto = MAXIMO_POR_CICLO }: { teto?: number } = {},
): Promise<ResultadoDaColeta> {
  const resultado: ResultadoDaColeta = {
    lidas: 0,
    descartadasSemCusto: 0,
    promocoesNovas: 0,
    duplicadas: 0,
    erros: 0,
    boas: [],
    descartadasPelaIA: 0,
    adiadas: 0,
  };

  const offset = await lerOffset();

  const atualizacoes = await chamar<MensagemDoTelegram[]>("getUpdates", {
    offset: offset > 0 ? offset + 1 : undefined,
    limit: 100,
    timeout: 0,
    allowed_updates: ["message", "channel_post"],
  });

  resultado.lidas = atualizacoes.length;
  if (atualizacoes.length === 0) return resultado;

  let ultimoProcessado = offset;
  let processadasComIA = 0;

  for (const [indice, atualizacao] of atualizacoes.entries()) {
    const mensagem = atualizacao.message ?? atualizacao.channel_post;
    const texto = mensagem?.text ?? mensagem?.caption;

    if (!texto) {
      // Figurinha, foto sem legenda, entrada de membro: nada a extrair, mas o
      // offset avança — releria para sempre se não avançasse.
      ultimoProcessado = atualizacao.update_id;
      resultado.descartadasSemCusto += 1;
      continue;
    }

    // O pré-filtro decide se esta mensagem vai custar cota. `extrairPromocao`
    // o consulta de novo internamente — é determinístico e roda em
    // microssegundos, então perguntar aqui antes é de graça e permite contar
    // o teto pelas chamadas que realmente acontecem.
    const vaiCustarIA = valeChamarIA(texto).vale;

    if (!vaiCustarIA) {
      resultado.descartadasSemCusto += 1;
      ultimoProcessado = atualizacao.update_id;
      continue;
    }

    if (processadasComIA >= teto) {
      // Teto atingido. Para aqui SEM avançar o offset além do que já foi
      // processado: o resto volta no próximo ciclo em vez de sumir.
      resultado.adiadas = atualizacoes.length - indice;
      break;
    }

    try {
      processadasComIA += 1;
      const extraida = await extrairPromocao(texto);

      if (!extraida) {
        // Passou do pré-filtro mas a IA disse que não é oferta de
        // informática. Custou cota — por isso conta separado.
        resultado.descartadasPelaIA += 1;
        ultimoProcessado = atualizacao.update_id;
        continue;
      }

      // Duplicata: a mesma oferta costuma ser repostada em vários grupos.
      // Sem isto, encaminhar duas vezes criaria duas promoções iguais.
      const jaExiste = await prisma.promotion.findFirst({
        where: {
          active: true,
          OR: [
            ...(extraida.url ? [{ url: extraida.url }] : []),
            { title: extraida.title, currentPrice: extraida.currentPrice },
          ],
        },
        select: { id: true },
      });

      if (jaExiste) {
        resultado.duplicadas += 1;
        ultimoProcessado = atualizacao.update_id;
        continue;
      }

      const promocao = await registrarPromocao(
        {
          title: extraida.title,
          currentPrice: extraida.currentPrice,
          regularPrice: extraida.regularPrice,
          storeName: extraida.storeName,
          categorySlug: extraida.categorySlug,
          url: extraida.url,
          coupon: extraida.coupon,
        },
        // A trilha registra "sistema", nao uma pessoa: quem coletou foi o
        // agendamento, e a auditoria precisa dizer a verdade sobre isso.
        contextoDoSistema("telegram"),
      );

      resultado.promocoesNovas += 1;

      // Avaliação contra o custo real das peças que você já comprou. É o que
      // separa "está barato" de "está barato para você".
      try {
        const avaliacao = await avaliarPromocao(
          promocao.id,
          contextoDoSistema("telegram"),
        );
        if (avaliacao && avaliacao.nota >= 7) {
          resultado.boas.push({
            titulo: extraida.title,
            preco: extraida.currentPrice,
            nota: avaliacao.nota,
          });
        }
      } catch {
        // Falhar a avaliação não invalida a oferta: ela fica registrada e
        // pode ser avaliada depois, pela tela.
      }

      ultimoProcessado = atualizacao.update_id;
    } catch (erro) {
      resultado.erros += 1;
      console.error("[telegram] falha ao processar mensagem:", erro);

      // Erro de cota interrompe o ciclo: insistir só gasta tentativa. O
      // offset fica onde está e as mensagens voltam no próximo ciclo.
      if (erro instanceof Error && erro.message.includes("limite de requisições")) {
        break;
      }

      // Erro pontual naquela mensagem: avança para não travar a fila para
      // sempre numa mensagem problemática.
      ultimoProcessado = atualizacao.update_id;
    }
  }

  if (ultimoProcessado > offset) await gravarOffset(ultimoProcessado);

  // Avisa só do que vale a pena. Notificação de oferta mediana ensina a
  // ignorar as notificações.
  if (resultado.boas.length > 0) {
    const melhor = resultado.boas.sort((a, b) => b.nota - a.nota)[0]!;
    const destinatarios = await prisma.user.findMany({
      where: { active: true, role: { in: ["ADMIN", "EMPLOYEE"] } },
      select: { id: true },
    });

    await enviarNotificacao(
      {
        titulo:
          resultado.boas.length === 1
            ? "Promoção que vale a pena"
            : `${resultado.boas.length} promoções que valem a pena`,
        corpo: `${melhor.titulo} — R$ ${melhor.preco.toFixed(2)}`,
        url: "/promocoes",
        tag: "promocao",
      },
      { userIds: destinatarios.map((u) => u.id) },
    );
  }

  return resultado;
}
