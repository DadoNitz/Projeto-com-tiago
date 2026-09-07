import path from "node:path";

import { valeChamarIA } from "../src/domain/promotions/pre-filtro";

/**
 * Diagnostico da coleta de promocoes pelo Telegram.
 *
 *   npm run telegram
 *
 * Responde as perguntas na ordem em que a configuracao costuma falhar:
 *
 *   1. O token existe e vale?          -> getMe
 *   2. O bot esta em algum grupo?      -> getUpdates
 *   3. Ele consegue LER as mensagens?  -> presenca de texto nas mensagens
 *   4. O pre-filtro aproveitaria?      -> quantas virariam consulta de IA
 *
 * A terceira e a que pega quase todo mundo: por padrao o BotFather liga o
 * "modo privacidade", e um bot assim so recebe mensagens que mencionam ele.
 * Num grupo onde voce encaminha ofertas isso significa receber nada — e sem
 * este diagnostico o sintoma e um sistema silencioso que parece funcionar.
 *
 * O script NAO consome a fila: le com offset negativo, que mostra as ultimas
 * mensagens sem confirmar recebimento. O agendamento ainda vai processa-las.
 */

// Mesma carga de .env dos demais scripts (ver prisma.config.ts).
for (const arquivo of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(process.cwd(), arquivo));
  } catch {
    // arquivo ausente e caso normal
  }
}

interface Chat {
  id: number;
  title?: string;
  first_name?: string;
  type: string;
}

interface Mensagem {
  text?: string;
  caption?: string;
  chat: Chat;
}

interface Atualizacao {
  update_id: number;
  message?: Mensagem;
  channel_post?: Mensagem;
}

const token = process.env.TELEGRAM_BOT_TOKEN;

function bloco(linhas: string[]): string {
  return `\n${linhas.join("\n")}\n`;
}

async function chamar<T>(metodo: string, params: Record<string, unknown> = {}) {
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

  if (!dados.ok) throw new Error(`${metodo}: ${dados.description ?? "sem motivo"}`);
  return dados.result as T;
}

/** Devolve o codigo de saida. Nao chama process.exit: ver nota no final. */
async function principal(): Promise<number> {
  if (!token) {
    console.error(
      bloco([
        "TELEGRAM_BOT_TOKEN nao esta definido no .env.",
        "",
        "Para obter um:",
        "  1. No Telegram, fale com @BotFather",
        "  2. Envie /newbot e siga as instrucoes",
        "  3. Copie o token para o .env:",
        "       TELEGRAM_BOT_TOKEN=123456:ABC-DEF...",
      ]),
    );
    return 1;
  }

  console.log("\n=== Diagnostico do bot de promocoes ===\n");

  // 1. O token vale?
  let eu: { username: string; first_name: string };
  try {
    eu = await chamar("getMe");
  } catch (erro) {
    console.error(
      bloco([
        `O Telegram recusou o token: ${erro instanceof Error ? erro.message : erro}`,
        "",
        "Token errado ou revogado. Peca outro ao @BotFather com /mytoken.",
      ]),
    );
    return 1;
  }

  console.log(`[ok] Token valido. Bot: @${eu.username} (${eu.first_name})`);

  // 2. Ha mensagens visiveis?
  const atualizacoes = await chamar<Atualizacao[]>("getUpdates", {
    // Negativo = ultimas N, sem confirmar. Nao consome a fila do agendamento.
    offset: -20,
    limit: 20,
    timeout: 0,
  });

  if (atualizacoes.length === 0) {
    console.log(
      bloco([
        "[--] Nenhuma mensagem visivel ainda.",
        "",
        "Esperado se voce acabou de criar o bot. Faca, nesta ordem:",
        "",
        "  1. DESLIGUE o modo privacidade ANTES de adicionar ao grupo:",
        "       @BotFather -> /mybots -> selecione o bot ->",
        "       Bot Settings -> Group Privacy -> Turn off",
        "     Sem isso o bot entra no grupo e nao le nada.",
        "  2. Crie um grupo no Telegram (pode ser so seu)",
        `  3. Adicione @${eu.username} nele`,
        "     (se ja tinha adicionado antes do passo 1, remova e adicione",
        "      de novo — a mudanca so vale a partir da nova entrada)",
        "  4. Encaminhe uma oferta para o grupo",
        "  5. Rode este script de novo",
      ]),
    );
    return 0;
  }

  // 3. Da para ler o conteudo?
  const grupos = new Map<number, string>();
  const textos: string[] = [];

  for (const atualizacao of atualizacoes) {
    const mensagem = atualizacao.message ?? atualizacao.channel_post;
    if (!mensagem) continue;
    const chat = mensagem.chat;
    grupos.set(chat.id, chat.title ?? chat.first_name ?? String(chat.id));
    const texto = mensagem.text ?? mensagem.caption;
    if (texto) textos.push(texto);
  }

  console.log(`[ok] ${atualizacoes.length} mensagem(ns) recentes visiveis.`);
  console.log(`     Origens: ${[...grupos.values()].join(", ") || "nenhuma"}`);

  if (textos.length === 0) {
    console.log(
      bloco([
        "[!!] Nenhuma delas tem texto.",
        "",
        "Quase sempre e o modo privacidade ligado: o bot ve os eventos do",
        "grupo (entrou, saiu) mas nao o conteudo das mensagens.",
        "",
        "  @BotFather -> /mybots -> o bot -> Bot Settings -> Group Privacy",
        "  -> Turn off, e depois remova e readicione o bot ao grupo.",
      ]),
    );
    return 1;
  }

  console.log(`[ok] ${textos.length} com texto legivel — a leitura funciona.`);

  // 4. Quantas sobreviveriam ao pre-filtro?
  const aprovadas = textos.filter((texto) => valeChamarIA(texto).vale);

  console.log(
    `[ok] ${aprovadas.length} de ${textos.length} passariam do pre-filtro e` +
      " virariam consulta de IA.",
  );

  if (aprovadas.length === 0) {
    console.log(
      bloco([
        "     Nenhuma parece oferta de informatica com preco. Se voce",
        "     encaminhou uma oferta de verdade e ela nao passou, o pre-filtro",
        "     precisa de ajuste: src/domain/promotions/pre-filtro.ts",
      ]),
    );
  } else {
    for (const texto of aprovadas.slice(0, 3)) {
      console.log(`     - ${texto.replace(/\s+/g, " ").slice(0, 70)}`);
    }
  }

  console.log(
    bloco([
      "Tudo pronto. A coleta roda uma vez ao dia pelo agendamento, ou na hora",
      'pelo botao "Buscar ofertas" na tela de promocoes.',
      "",
      "Falta ainda o token em producao:",
      "  npx vercel env add TELEGRAM_BOT_TOKEN production",
    ]),
  );

  return 0;
}

// `process.exitCode` em vez de `process.exit()`: com exit() o Node derruba o
// processo com o fetch ainda fechando, e no Windows o libuv aborta com
// "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" — um estouro que
// aparece depois da mensagem util e faz o diagnostico parecer quebrado
// justamente quando terminou bem.
// Sem `await` de topo: o tsx transpila para CommonJS neste projeto, e la o
// await de topo nao existe.
void principal().then((codigo) => {
  process.exitCode = codigo;
});
