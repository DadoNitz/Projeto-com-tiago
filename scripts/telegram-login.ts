import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";

import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

/**
 * Login da sua conta pessoal do Telegram, uma vez só.
 *
 *   npm run telegram:login
 *
 * ## Por que isto existe, e por que ele é diferente do bot
 *
 * Um bot não consegue ler canal de terceiro: só recebe mensagens de chats
 * onde foi adicionado (e num canal, só um admin adiciona), e a API de bots
 * nem sequer tem método para ler histórico. Para acompanhar PC do Fafa,
 * Fraguas e afins, o único caminho é a API de cliente (MTProto), usando a
 * **sua conta** — a mesma que o app do celular usa.
 *
 * ## O que você está criando aqui
 *
 * Uma "string de sessão": uma credencial que **é você** no Telegram. Quem
 * tiver ela lê suas conversas privadas e manda mensagem no seu nome. Ela não
 * expira sozinha.
 *
 * Por isso:
 *
 * - Ela vai para o `.env`, que o `.gitignore` cobre. Nunca para o repositório.
 * - Nunca a cole em chat, issue, print ou pergunta em fórum.
 * - Se vazar: Telegram → Ajustes → Dispositivos → encerre a sessão. Isso a
 *   invalida na hora.
 *
 * O coletor que usa esta sessão (`telegram-coletar.ts`) só **lê** canais e
 * **reencaminha** para o seu grupo. Não manda mensagem para ninguém, não
 * entra em grupo, não responde nada.
 *
 * ## Antes de rodar
 *
 * Pegue `api_id` e `api_hash` em https://my.telegram.org → API development
 * tools, e coloque no `.env`:
 *
 *   TELEGRAM_API_ID=1234567
 *   TELEGRAM_API_HASH=abc123...
 */

const RAIZ = process.cwd();

for (const arquivo of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(RAIZ, arquivo));
  } catch {
    // arquivo ausente e caso normal
  }
}

function faltando(): string[] {
  return ["TELEGRAM_API_ID", "TELEGRAM_API_HASH"].filter(
    (nome) => !process.env[nome],
  );
}

async function principal(): Promise<number> {
  const ausentes = faltando();

  if (ausentes.length > 0) {
    console.error(
      [
        "",
        `Falta no .env: ${ausentes.join(", ")}`,
        "",
        "Como obter:",
        "  1. Acesse https://my.telegram.org e entre com seu numero",
        "  2. API development tools -> preencha qualquer nome de app",
        "  3. Copie api_id e api_hash para o .env:",
        "       TELEGRAM_API_ID=1234567",
        "       TELEGRAM_API_HASH=abc123...",
        "",
      ].join("\n"),
    );
    return 1;
  }

  if (process.env.TELEGRAM_SESSION) {
    console.log(
      [
        "",
        "Ja existe uma TELEGRAM_SESSION no .env.",
        "",
        "Se quiser trocar de conta, apague essa linha e rode de novo.",
        "Para conferir se a atual funciona:  npm run telegram:canais",
        "",
      ].join("\n"),
    );
    return 0;
  }

  console.log(
    [
      "",
      "=== Login da conta pessoal no Telegram ===",
      "",
      "ATENCAO: isto cria uma credencial que E VOCE no Telegram. Ela le suas",
      "conversas privadas e manda mensagem no seu nome. Vai para o .env, que",
      "o git ignora. Nunca compartilhe.",
      "",
      "Para revogar depois: Telegram -> Ajustes -> Dispositivos -> encerrar.",
      "",
    ].join("\n"),
  );

  const pergunta = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const cliente = new TelegramClient(
    new StringSession(""),
    Number(process.env.TELEGRAM_API_ID),
    process.env.TELEGRAM_API_HASH!,
    { connectionRetries: 3 },
  );

  try {
    await cliente.start({
      phoneNumber: async () =>
        (await pergunta.question("Numero com DDI (ex: +5511987654321): ")).trim(),
      phoneCode: async () =>
        (await pergunta.question("Codigo que chegou no Telegram: ")).trim(),
      // Só é chamado se a conta tiver verificação em duas etapas.
      password: async () =>
        (await pergunta.question("Senha da verificacao em duas etapas: ")).trim(),
      onError: (erro) => {
        console.error("Falhou:", erro.message);
      },
    });

    const eu = (await cliente.getMe()) as Api.User;
    const sessao = String(cliente.session.save());

    // Grava no .env em vez de imprimir: uma credencial no terminal acaba em
    // histórico de shell, print de tela e rolagem compartilhada.
    const caminho = path.join(RAIZ, ".env");
    const atual = await readFile(caminho, "utf-8").catch(() => "");
    const separador = atual.endsWith("\n") || atual === "" ? "" : "\n";

    await appendFile(
      caminho,
      [
        separador,
        "",
        "# Sessao da SUA conta pessoal no Telegram. Equivale a sua conta:",
        "# le conversas privadas e envia mensagem no seu nome. Nunca comite,",
        "# nunca cole em chat. Revogar: Telegram -> Ajustes -> Dispositivos.",
        `TELEGRAM_SESSION="${sessao}"`,
        "",
      ].join("\n"),
      "utf-8",
    );

    console.log(
      [
        "",
        `[ok] Conectado como ${eu.firstName ?? ""} (@${eu.username ?? "sem username"}).`,
        "[ok] Sessao gravada no .env (nao foi impressa aqui, de proposito).",
        "",
        "Proximo passo:  npm run telegram:canais",
        "  lista os canais que voce acompanha, para escolher quais monitorar.",
        "",
      ].join("\n"),
    );

    return 0;
  } catch (erro) {
    console.error(
      `\nNao consegui entrar: ${erro instanceof Error ? erro.message : erro}\n`,
    );
    return 1;
  } finally {
    pergunta.close();
    await cliente.disconnect();
    await cliente.destroy();
  }
}

void principal().then((codigo) => {
  process.exitCode = codigo;
});
