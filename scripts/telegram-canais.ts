import path from "node:path";

import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

/**
 * Lista os canais e grupos que a sua conta acompanha.
 *
 *   npm run telegram:canais
 *
 * Serve para escolher o que monitorar sem digitar nome errado — e nome errado
 * aqui falha em silêncio: o coletor simplesmente não acha o canal e não traz
 * nada, sem dizer por quê.
 *
 * Também mostra o id do grupo de destino, que o coletor precisa saber.
 *
 * Só lê. Não entra em canal, não sai de canal, não escreve em lugar nenhum.
 */

for (const arquivo of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(process.cwd(), arquivo));
  } catch {
    // arquivo ausente e caso normal
  }
}

/** Formata para caber numa linha de terminal sem quebrar. */
function encurtar(texto: string, largura: number): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length <= largura ? limpo : `${limpo.slice(0, largura - 1)}…`;
}

async function principal(): Promise<number> {
  const { TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION } = process.env;

  if (!TELEGRAM_API_ID || !TELEGRAM_API_HASH || !TELEGRAM_SESSION) {
    console.error(
      "\nFalta a sessao. Rode primeiro:  npm run telegram:login\n",
    );
    return 1;
  }

  const cliente = new TelegramClient(
    new StringSession(TELEGRAM_SESSION),
    Number(TELEGRAM_API_ID),
    TELEGRAM_API_HASH,
    { connectionRetries: 3 },
  );

  try {
    await cliente.connect();

    if (!(await cliente.isUserAuthorized())) {
      console.error(
        [
          "",
          "A sessao existe mas nao vale mais.",
          "",
          "Normalmente e porque ela foi encerrada em Ajustes -> Dispositivos.",
          "Apague a linha TELEGRAM_SESSION do .env e rode:",
          "  npm run telegram:login",
          "",
        ].join("\n"),
      );
      return 1;
    }

    const dialogos = await cliente.getDialogs({ limit: 200 });

    const canais: { nome: string; user: string; id: string }[] = [];
    const grupos: { nome: string; id: string }[] = [];

    for (const dialogo of dialogos) {
      const entidade = dialogo.entity;
      if (!entidade) continue;

      if (entidade instanceof Api.Channel) {
        const id = `-100${entidade.id.toString()}`;
        // `broadcast` distingue canal (só o dono publica) de supergrupo.
        if (entidade.broadcast) {
          canais.push({
            nome: entidade.title,
            user: entidade.username ? `@${entidade.username}` : "(privado)",
            id,
          });
        } else {
          grupos.push({ nome: entidade.title, id });
        }
      } else if (entidade instanceof Api.Chat) {
        grupos.push({ nome: entidade.title, id: `-${entidade.id.toString()}` });
      }
    }

    console.log("\n=== CANAIS que voce acompanha ===");
    console.log("   (candidatos a monitorar — use o @ na configuracao)\n");

    if (canais.length === 0) {
      console.log("   nenhum canal encontrado.\n");
    } else {
      for (const canal of canais) {
        console.log(
          `   ${encurtar(canal.nome, 38).padEnd(40)} ${canal.user.padEnd(24)} ${canal.id}`,
        );
      }
    }

    console.log("\n=== GRUPOS (candidatos a destino) ===\n");

    if (grupos.length === 0) {
      console.log("   nenhum grupo encontrado.\n");
    } else {
      for (const grupo of grupos) {
        console.log(`   ${encurtar(grupo.nome, 38).padEnd(40)} ${grupo.id}`);
      }
    }

    console.log(
      [
        "",
        "Configure no .env:",
        "",
        "  # canais a monitorar, separados por virgula (use o @)",
        '  TELEGRAM_CANAIS="@pcdofafa,@outrocanal"',
        "",
        "  # grupo para onde as ofertas serao reencaminhadas",
        "  # (o mesmo onde o @notztech_bot ja esta)",
        '  TELEGRAM_GRUPO_DESTINO="-1001234567890"',
        "",
        "Depois:  npm run telegram:coletar",
        "",
      ].join("\n"),
    );

    return 0;
  } catch (erro) {
    console.error(`\nFalhou: ${erro instanceof Error ? erro.message : erro}\n`);
    return 1;
  } finally {
    await cliente.disconnect();
    await cliente.destroy();
  }
}

void principal().then((codigo) => {
  process.exitCode = codigo;
});
