import path from "node:path";

import { TelegramClient } from "telegram";
import { FloodWaitError } from "telegram/errors";
import { StringSession } from "telegram/sessions";

import { valeChamarIA } from "../src/domain/promotions/pre-filtro";
import { prisma } from "../prisma/seed/client";

/**
 * Coletor MTProto: lê os canais que você acompanha e reencaminha as ofertas
 * para o seu grupo.
 *
 *   npm run telegram:coletar              uma passada
 *   npm run telegram:coletar -- --continuo  fica rodando
 *
 * ## O que ele faz, e o que deliberadamente NÃO faz
 *
 * Faz uma coisa só: lê canal, filtra, reencaminha. Não fala com IA, não
 * escreve promoção no banco, não avalia preço. Tudo isso continua sendo feito
 * pelo `@notztech_bot` a partir do grupo, com o código que já estava pronto e
 * testado.
 *
 * A separação é proposital. Este é o componente que roda com a **sua conta
 * pessoal**, e componente arriscado tem que ser pequeno e fazer pouco. Se
 * você parar de rodar isto, o sistema inteiro continua funcionando — você só
 * volta a encaminhar as ofertas na mão.
 *
 * Ele nunca envia mensagem para pessoa nenhuma, nunca entra ou sai de canal,
 * nunca responde nada. Só lê e reencaminha para um grupo seu.
 *
 * ## Por que o pré-filtro roda aqui também
 *
 * Cinco canais de promoção despejam centenas de mensagens por dia, e a
 * maioria não é hardware. Reencaminhar tudo transformaria o grupo num
 * segundo despejo — e o trabalho de separar, que é o ponto do sistema, teria
 * apenas mudado de lugar. O filtro é o mesmo `valeChamarIA` do bot: código
 * único, comportamento único, testes únicos.
 */

for (const arquivo of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(process.cwd(), arquivo));
  } catch {
    // arquivo ausente e caso normal
  }
}

/** Quantas mensagens olhar por canal, por passada. */
const MAXIMO_POR_CANAL = 40;

/**
 * Teto de reencaminhos por passada.
 *
 * Reencaminhar rápido demais é o caminho conhecido para o Telegram aplicar
 * FloodWait — e, insistindo, para a conta ser limitada. Um teto por passada
 * é mais seguro que confiar na sorte: o excedente fica para a próxima, e
 * nada se perde porque o ponto de leitura só avança sobre o processado.
 */
const MAXIMO_REENCAMINHOS = 25;

/** Intervalo entre reencaminhos. Devagar de propósito: ver acima. */
const PAUSA_ENTRE_ENVIOS_MS = 2_500;

/** Intervalo do modo contínuo. */
const INTERVALO_CONTINUO_MS = 10 * 60_000;

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Ponto de leitura por canal, na mesma tabela que o bot usa. */
async function lerUltimoId(canal: string): Promise<number> {
  const registro = await prisma.appSetting.findUnique({
    where: { key: `telegram.canal.${canal}` },
  });
  return registro ? Number(registro.value) || 0 : 0;
}

async function gravarUltimoId(canal: string, id: number): Promise<void> {
  const key = `telegram.canal.${canal}`;
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: String(id) },
    update: { value: String(id) },
  });
}

interface Resultado {
  examinadas: number;
  reencaminhadas: number;
  descartadas: number;
  adiadas: number;
}

async function coletarDoCanal(
  cliente: TelegramClient,
  canal: string,
  destino: string,
  restantes: number,
): Promise<Resultado> {
  const r: Resultado = {
    examinadas: 0,
    reencaminhadas: 0,
    descartadas: 0,
    adiadas: 0,
  };

  const ultimoId = await lerUltimoId(canal);

  let entidade;
  try {
    entidade = await cliente.getEntity(canal);
  } catch {
    console.log(`  [!!] ${canal}: nao encontrado. Voce acompanha esse canal?`);
    return r;
  }

  // Da mais nova para a mais antiga. `minId` traz só o que chegou depois da
  // ultima passada.
  const mensagens = await cliente.getMessages(entidade, {
    limit: MAXIMO_POR_CANAL,
    ...(ultimoId > 0 ? { minId: ultimoId } : {}),
  });

  // Inverte para reencaminhar na ordem cronologica: no grupo, oferta antiga
  // acima da nova ficaria confusa de ler.
  const emOrdem = [...mensagens].reverse();

  // Primeira passada: nao despeja o historico no grupo. Marca onde estamos e
  // passa a valer da proxima mensagem em diante.
  if (ultimoId === 0) {
    const maisNova = emOrdem.at(-1);
    if (maisNova) await gravarUltimoId(canal, maisNova.id);
    console.log(
      `  [--] ${canal}: primeira leitura, marcado no ponto atual` +
        " (nao reencaminha historico).",
    );
    return r;
  }

  let processadoAte = ultimoId;

  for (const mensagem of emOrdem) {
    const texto = mensagem.text ?? mensagem.message ?? "";
    r.examinadas += 1;

    if (r.reencaminhadas >= restantes) {
      r.adiadas += 1;
      continue; // sem avancar o ponto: volta na proxima passada
    }

    if (!texto || !valeChamarIA(texto).vale) {
      r.descartadas += 1;
      processadoAte = Math.max(processadoAte, mensagem.id);
      continue;
    }

    try {
      await cliente.forwardMessages(destino, {
        messages: [mensagem.id],
        fromPeer: entidade,
      });

      r.reencaminhadas += 1;
      processadoAte = Math.max(processadoAte, mensagem.id);
      console.log(`  [->] ${texto.replace(/\s+/g, " ").slice(0, 62)}`);

      await espera(PAUSA_ENTRE_ENVIOS_MS);
    } catch (erro) {
      if (erro instanceof FloodWaitError) {
        // O Telegram disse exatamente quanto esperar. Insistir antes disso e
        // o caminho para a conta ser limitada de verdade.
        console.log(
          `  [!!] Telegram pediu pausa de ${erro.seconds}s. Parando esta passada.`,
        );
        break;
      }
      console.log(
        `  [!!] falha ao reencaminhar: ${erro instanceof Error ? erro.message : erro}`,
      );
      // Nao avanca o ponto: tenta de novo na proxima.
      break;
    }
  }

  if (processadoAte > ultimoId) await gravarUltimoId(canal, processadoAte);

  return r;
}

async function umaPassada(cliente: TelegramClient): Promise<void> {
  const canais = (process.env.TELEGRAM_CANAIS ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  const destino = process.env.TELEGRAM_GRUPO_DESTINO!;
  const total: Resultado = {
    examinadas: 0,
    reencaminhadas: 0,
    descartadas: 0,
    adiadas: 0,
  };

  console.log(`\n[${new Date().toLocaleTimeString("pt-BR")}] lendo ${canais.length} canal(is)...`);

  for (const canal of canais) {
    const restantes = MAXIMO_REENCAMINHOS - total.reencaminhadas;
    if (restantes <= 0) {
      console.log(`  [--] ${canal}: teto da passada atingido, fica para depois.`);
      continue;
    }

    const r = await coletarDoCanal(cliente, canal, destino, restantes);
    total.examinadas += r.examinadas;
    total.reencaminhadas += r.reencaminhadas;
    total.descartadas += r.descartadas;
    total.adiadas += r.adiadas;
  }

  console.log(
    `  ${total.examinadas} examinadas · ${total.reencaminhadas} reencaminhadas · ` +
      `${total.descartadas} descartadas${total.adiadas > 0 ? ` · ${total.adiadas} adiadas` : ""}`,
  );
}

async function principal(): Promise<number> {
  const { TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION } = process.env;

  if (!TELEGRAM_API_ID || !TELEGRAM_API_HASH || !TELEGRAM_SESSION) {
    console.error("\nFalta a sessao. Rode primeiro:  npm run telegram:login\n");
    return 1;
  }

  if (!process.env.TELEGRAM_GRUPO_DESTINO || !process.env.TELEGRAM_CANAIS) {
    console.error(
      [
        "",
        "Falta configurar no .env:",
        '  TELEGRAM_CANAIS="@pcdofafa,@outrocanal"',
        '  TELEGRAM_GRUPO_DESTINO="-1001234567890"',
        "",
        "Rode `npm run telegram:canais` para ver os nomes e ids certos.",
        "",
      ].join("\n"),
    );
    return 1;
  }

  const continuo = process.argv.includes("--continuo");

  const cliente = new TelegramClient(
    new StringSession(TELEGRAM_SESSION),
    Number(TELEGRAM_API_ID),
    TELEGRAM_API_HASH,
    { connectionRetries: 5 },
  );

  try {
    await cliente.connect();

    if (!(await cliente.isUserAuthorized())) {
      console.error(
        "\nA sessao nao vale mais. Apague TELEGRAM_SESSION do .env e refaca o login.\n",
      );
      return 1;
    }

    console.log("\n=== Coletor de ofertas (conta pessoal) ===");
    console.log("Le canais e reencaminha para o seu grupo. Nao envia mais nada.");

    if (continuo) {
      console.log(
        `Modo continuo: a cada ${INTERVALO_CONTINUO_MS / 60_000} min. Ctrl+C para parar.`,
      );

      // Encerramento limpo: sem isto, o Ctrl+C deixa a conexao pendurada e o
      // processo nao morre.
      let rodando = true;
      process.on("SIGINT", () => {
        console.log("\nEncerrando...");
        rodando = false;
      });

      while (rodando) {
        await umaPassada(cliente);
        for (let i = 0; i < INTERVALO_CONTINUO_MS / 1000 && rodando; i += 1) {
          await espera(1000);
        }
      }
    } else {
      await umaPassada(cliente);
      console.log(
        "\nO @notztech_bot pega daqui: coleta do grupo no agendamento das 9h," +
          '\nou agora pelo botao "Buscar ofertas" na tela de promocoes.\n',
      );
    }

    return 0;
  } catch (erro) {
    console.error(`\nFalhou: ${erro instanceof Error ? erro.message : erro}\n`);
    return 1;
  } finally {
    await cliente.disconnect();
    await cliente.destroy();
    await prisma.$disconnect();
  }
}

void principal().then((codigo) => {
  process.exitCode = codigo;
});
