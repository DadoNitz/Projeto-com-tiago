/**
 * Diagnostico da coleta de promocoes pelo Telegram.
 *
 *   npm run telegram
 *
 * Responde tres perguntas, na ordem em que a configuracao costuma falhar:
 *
 *   1. O token existe e vale?          -> getMe
 *   2. O bot esta em algum grupo?      -> getUpdates
 *   3. Ele consegue LER as mensagens?  -> presenca de texto nas mensagens
 *
 * A terceira e a que pega quase todo mundo: por padrao o BotFather liga o
 * "modo privacidade", e um bot com privacidade ligada so recebe mensagens que
 * mencionam ele. Num grupo onde voce encaminha ofertas, isso significa
 * receber nada — e sem este diagnostico o sintoma e um sistema silencioso que
 * parece estar funcionando.
 *
 * Este script NAO consome a fila: le com offset negativo, que mostra as
 * ultimas mensagens sem confirmar recebimento. O agendamento ainda vai
 * processa-las normalmente.
 */

const token = process.env.TELEGRAM_BOT_TOKEN;

function encerrar(mensagem, codigo = 1) {
  console.error(`\n${mensagem}\n`);
  process.exit(codigo);
}

if (!token) {
  encerrar(
    [
      "TELEGRAM_BOT_TOKEN nao esta definido no .env.",
      "",
      "Para obter um:",
      "  1. No Telegram, fale com @BotFather",
      "  2. Envie /newbot e siga as instrucoes",
      "  3. Copie o token e coloque no .env:",
      "       TELEGRAM_BOT_TOKEN=123456:ABC-DEF...",
    ].join("\n"),
  );
}

async function chamar(metodo, params = {}) {
  const resposta = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(30_000),
  });
  const dados = await resposta.json();
  if (!dados.ok) throw new Error(`${metodo}: ${dados.description}`);
  return dados.result;
}

console.log("\n=== Diagnostico do bot de promocoes ===\n");

// 1. O token vale?
let eu;
try {
  eu = await chamar("getMe");
} catch (erro) {
  encerrar(
    [
      `O Telegram recusou o token: ${erro.message}`,
      "",
      "Token errado ou revogado. Peca outro ao @BotFather com /mytoken.",
    ].join("\n"),
  );
}

console.log(`[ok] Token valido. Bot: @${eu.username} (${eu.first_name})`);

// 2. Ha grupos, e da para ler?
const atualizacoes = await chamar("getUpdates", {
  // Negativo = ultimas N, sem confirmar. Nao consome a fila do agendamento.
  offset: -20,
  limit: 20,
  timeout: 0,
});

if (atualizacoes.length === 0) {
  console.log(
    [
      "",
      "[--] Nenhuma mensagem visivel ainda.",
      "",
      "Isso e esperado se voce acabou de criar o bot. Faca:",
      "",
      `  1. Crie um grupo no Telegram (so seu, pode ser)`,
      `  2. Adicione @${eu.username} nele`,
      "  3. IMPORTANTE — desligue o modo privacidade:",
      "       @BotFather -> /mybots -> selecione o bot ->",
      "       Bot Settings -> Group Privacy -> Turn off",
      "     Sem isso o bot nao le as mensagens do grupo.",
      "  4. Remova e adicione o bot de novo no grupo",
      "     (a mudanca de privacidade so vale a partir da nova entrada)",
      "  5. Encaminhe uma oferta para o grupo e rode este script de novo",
      "",
    ].join("\n"),
  );
  process.exit(0);
}

const grupos = new Map();
let comTexto = 0;

for (const atualizacao of atualizacoes) {
  const mensagem = atualizacao.message ?? atualizacao.channel_post;
  if (!mensagem) continue;
  const chat = mensagem.chat;
  grupos.set(chat.id, chat.title ?? chat.first_name ?? String(chat.id));
  if (mensagem.text ?? mensagem.caption) comTexto += 1;
}

console.log(`[ok] ${atualizacoes.length} mensagem(ns) recentes visiveis.`);
console.log(`     Origens: ${[...grupos.values()].join(", ") || "nenhuma"}`);

if (comTexto === 0) {
  console.log(
    [
      "",
      "[!!] Nenhuma delas tem texto.",
      "",
      "Quase sempre e o modo privacidade ligado: o bot ve os eventos do grupo",
      "(entrou, saiu) mas nao o conteudo das mensagens.",
      "",
      "  @BotFather -> /mybots -> o bot -> Bot Settings -> Group Privacy",
      "  -> Turn off, e depois remova e readicione o bot ao grupo.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

console.log(`[ok] ${comTexto} com texto legivel — a leitura esta funcionando.`);

// 3. O pre-filtro aproveitaria alguma?
const { valeChamarIA } = await import("../src/domain/promotions/pre-filtro.ts").catch(
  () => ({ valeChamarIA: null }),
);

if (valeChamarIA) {
  let passariam = 0;
  for (const atualizacao of atualizacoes) {
    const mensagem = atualizacao.message ?? atualizacao.channel_post;
    const texto = mensagem?.text ?? mensagem?.caption;
    if (texto && valeChamarIA(texto).vale) passariam += 1;
  }
  console.log(
    `[ok] Dessas, ${passariam} passariam do pre-filtro e virariam consulta de IA.`,
  );
}

console.log("\nTudo pronto. A coleta roda pelo agendamento, ou pelo botao");
console.log("\"Buscar ofertas\" na tela de promocoes.\n");
