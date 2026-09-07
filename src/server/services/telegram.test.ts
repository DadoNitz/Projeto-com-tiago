import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Coleta de promoções pelo Telegram.
 *
 * O que se testa aqui é o **avanço do offset**, e não a extração — essa já tem
 * teste próprio no pré-filtro. O offset é a peça que falha em silêncio: se
 * avançar demais, ofertas somem sem ninguém perceber; se não avançar, a mesma
 * mensagem é reprocessada para sempre, gastando cota a cada ciclo.
 *
 * Nenhum dos dois defeitos aparece na tela. Por isso são estes os testes.
 */

const configuracoes = new Map<string, string>();
const chamadasDeIA: string[] = [];
let respostaDoTelegram: unknown[] = [];
let promocoesRegistradas: { title: string }[] = [];

vi.mock("@/server/db/client", () => ({
  prisma: {
    appSetting: {
      findUnique: vi.fn(({ where }: { where: { key: string } }) => {
        const valor = configuracoes.get(where.key);
        return Promise.resolve(valor === undefined ? null : { value: valor });
      }),
      upsert: vi.fn(
        ({
          where,
          update,
        }: {
          where: { key: string };
          update: { value: string };
        }) => {
          configuracoes.set(where.key, update.value);
          return Promise.resolve({});
        },
      ),
    },
    promotion: { findFirst: vi.fn(() => Promise.resolve(null)) },
    user: { findMany: vi.fn(() => Promise.resolve([])) },
  },
}));

vi.mock("./deal-parser.service", () => ({
  extrairPromocao: vi.fn((texto: string) => {
    chamadasDeIA.push(texto);
    // Só as mensagens com "RTX" viram oferta; o resto a IA descarta.
    if (!texto.includes("RTX")) return Promise.resolve(null);
    return Promise.resolve({
      title: texto.slice(0, 40),
      currentPrice: 1799,
      confianca: "alta" as const,
    });
  }),
}));

vi.mock("./promotion.service", () => ({
  registrarPromocao: vi.fn((dados: { title: string }) => {
    promocoesRegistradas.push(dados);
    return Promise.resolve({ id: `promo-${promocoesRegistradas.length}` });
  }),
  avaliarPromocao: vi.fn(() => Promise.resolve({ nota: 5, veredito: "ok" })),
}));

vi.mock("./push.service", () => ({
  enviarNotificacao: vi.fn(() => Promise.resolve({ enviadas: 0 })),
}));

const { coletarPromocoes } = await import("./telegram.service");

/** Monta uma mensagem no formato que o Telegram devolve. */
function mensagem(updateId: number, texto: string | null) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 1_700_000_000,
      ...(texto === null ? {} : { text: texto }),
      chat: { id: -100, title: "Ofertas", type: "group" },
    },
  };
}

const OFERTA = "🔥 RTX 4060 por R$ 1.799 na Kabum";
const CONVERSA = "bom dia pessoal, tudo certo por aí?";

beforeEach(() => {
  // Limpa o histórico de chamadas, não as implementações: sem isto um teste
  // conta as chamadas dos anteriores junto.
  vi.clearAllMocks();

  configuracoes.clear();
  chamadasDeIA.length = 0;
  promocoesRegistradas = [];
  respostaDoTelegram = [];

  process.env.TELEGRAM_BOT_TOKEN = "token-de-teste";

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: string }) => {
      if (String(url).endsWith("/getUpdates")) {
        const params = JSON.parse(init.body) as { offset?: number };
        // O servidor do Telegram só devolve o que está acima do offset. Sem
        // simular isso, o teste não veria a diferença entre avançar e não.
        const desde = params.offset ?? 0;
        const visiveis = respostaDoTelegram.filter(
          (u) => (u as { update_id: number }).update_id >= desde,
        );
        return { json: async () => ({ ok: true, result: visiveis }) };
      }
      return { json: async () => ({ ok: true, result: {} }) };
    }),
  );
});

describe("avanço do offset", () => {
  it("guarda o ponto de leitura e não relê no ciclo seguinte", async () => {
    respostaDoTelegram = [mensagem(10, OFERTA), mensagem(11, CONVERSA)];

    const primeiro = await coletarPromocoes();
    expect(primeiro.promocoesNovas).toBe(1);

    // Segundo ciclo, nada novo chegou. Se o offset não tivesse sido gravado,
    // a mesma oferta seria registrada de novo — e a cota gasta de novo.
    const segundo = await coletarPromocoes();
    expect(segundo.lidas).toBe(0);
    expect(segundo.promocoesNovas).toBe(0);
    expect(promocoesRegistradas).toHaveLength(1);
  });

  it("avança sobre mensagens sem texto em vez de travar nelas", async () => {
    // Figurinha ou entrada de membro: nada a extrair. Se o offset não passasse
    // por cima, toda coleta futura começaria por ela e nunca alcançaria as
    // ofertas depois dela.
    respostaDoTelegram = [mensagem(20, null), mensagem(21, OFERTA)];

    const resultado = await coletarPromocoes();

    expect(resultado.promocoesNovas).toBe(1);
    expect(configuracoes.get("telegram.ultimoUpdateId")).toBe("21");
  });

  it("não avança além do teto de cota: o excedente volta no próximo ciclo", async () => {
    // O teto vai explícito: o que se testa é o comportamento no limite, e não
    // o valor atual da constante — que muda conforme a cota do plano.
    respostaDoTelegram = Array.from({ length: 20 }, (_, i) =>
      mensagem(100 + i, `${OFERTA} #${i}`),
    );

    const primeiro = await coletarPromocoes({ teto: 6 });

    expect(primeiro.promocoesNovas).toBe(6);
    expect(primeiro.adiadas).toBe(14);
    // Parou na 6ª (update_id 105), então o offset é 105 — não 119. Se
    // avançasse até o fim, 14 ofertas sumiriam sem deixar rastro.
    expect(configuracoes.get("telegram.ultimoUpdateId")).toBe("105");

    const segundo = await coletarPromocoes({ teto: 100 });

    expect(segundo.promocoesNovas).toBe(14);
    expect(promocoesRegistradas).toHaveLength(20);
  });
});

describe("economia de cota", () => {
  it("não chama a IA para mensagem que o pré-filtro descarta", async () => {
    respostaDoTelegram = [
      mensagem(30, CONVERSA),
      mensagem(31, "kkkk"),
      mensagem(32, "Air fryer Mondial 4L por R$ 299"),
      mensagem(33, OFERTA),
    ];

    const resultado = await coletarPromocoes();

    // Só a oferta de hardware custou chamada.
    expect(chamadasDeIA).toHaveLength(1);
    expect(chamadasDeIA[0]).toContain("RTX");
    expect(resultado.descartadasSemCusto).toBe(3);
  });

  it("separa o que a IA descartou do que nem chegou nela", async () => {
    // A distinção importa para saber se a cota está sendo bem gasta: muitas
    // "descartadasPelaIA" significam que o pré-filtro está frouxo demais.
    respostaDoTelegram = [
      mensagem(40, CONVERSA),
      mensagem(41, "Notebook Dell i5 por R$ 2.499 na Amazon"),
    ];

    const resultado = await coletarPromocoes();

    expect(resultado.descartadasSemCusto).toBe(1);
    expect(resultado.descartadasPelaIA).toBe(1);
    expect(chamadasDeIA).toHaveLength(1);
  });
});

describe("erro no meio do ciclo", () => {
  it("não perde as mensagens seguintes quando uma falha", async () => {
    const { extrairPromocao } = await import("./deal-parser.service");
    vi.mocked(extrairPromocao).mockImplementationOnce(() => {
      throw new Error("falha de rede");
    });

    respostaDoTelegram = [mensagem(50, OFERTA), mensagem(51, `${OFERTA} #2`)];

    const resultado = await coletarPromocoes();

    // A que falhou é contada como erro, mas o ciclo continua: travar a fila
    // numa mensagem problemática pararia a coleta para sempre.
    expect(resultado.erros).toBe(1);
    expect(resultado.promocoesNovas).toBe(1);
  });
});

describe("de qual cota a coleta gasta", () => {
  it("avalia pelo modelo de lote, não pelo interativo", async () => {
    // Regressão de um defeito real: a avaliação chamava `aiProvider()` sem
    // argumento e caía no modelo interativo. Cada oferta coletada consumia,
    // em silêncio, uma requisição da mesma cota diária que a leitura de
    // etiqueta usa — e num dia movimentado o cadastro de peça ficaria sem IA
    // por causa do bot.
    const { avaliarPromocao } = await import("./promotion.service");

    respostaDoTelegram = [mensagem(60, OFERTA)];
    await coletarPromocoes();

    expect(vi.mocked(avaliarPromocao)).toHaveBeenCalledTimes(1);
    const [, ator] = vi.mocked(avaliarPromocao).mock.calls[0]!;

    // É o `userId` nulo que faz o serviço escolher o modelo de lote.
    expect(ator).toMatchObject({ userId: null, origem: "telegram" });
  });
});

describe("orçamento de tempo", () => {
  it("para sozinho antes de estourar a função, e salva o progresso", async () => {
    // A função da Vercel morre em 300s. Ser morto no meio e a pior saida: o
    // offset nao e gravado, e o ciclo inteiro e refeito na proxima — pagando
    // de novo por tudo que ja tinha sido processado.
    const { extrairPromocao } = await import("./deal-parser.service");

    // Cada extração "gasta" 40s de relógio.
    let agora = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => agora);
    vi.mocked(extrairPromocao).mockImplementation((texto: string) => {
      agora += 40_000;
      return Promise.resolve({
        title: texto.slice(0, 40),
        currentPrice: 1799,
        confianca: "alta" as const,
      });
    });

    respostaDoTelegram = Array.from({ length: 10 }, (_, i) =>
      mensagem(200 + i, `${OFERTA} #${i}`),
    );

    // Teto alto de propósito: quem tem de parar o ciclo aqui é o tempo.
    const r = await coletarPromocoes({ teto: 100, orcamentoMs: 120_000 });

    expect(r.pararamPorTempo).toBe(true);
    expect(r.promocoesNovas).toBeGreaterThan(0);
    expect(r.promocoesNovas).toBeLessThan(10);
    expect(r.adiadas).toBeGreaterThan(0);

    // O progresso foi gravado: sem isto o proximo ciclo refaria tudo.
    const salvo = Number(configuracoes.get("telegram.ultimoUpdateId"));
    expect(salvo).toBeGreaterThanOrEqual(200);
    expect(salvo).toBeLessThan(209);

    vi.mocked(Date.now).mockRestore();
  });
});
