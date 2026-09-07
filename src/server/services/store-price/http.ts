/**
 * Buscador de página das lojas.
 *
 * Regras que este módulo impõe, e o motivo de cada uma:
 *
 * - **User-agent honesto.** Testado: Kabum, Pichau e Terabyte respondem 200
 *   para um agente identificado. Não há motivo para me disfarçar de Chrome, e
 *   fingir ser navegador é o começo de uma briga com a loja que não quero.
 * - **Timeout curto.** A consulta acontece enquanto alguém espera uma nota na
 *   tela. Loja lenta vira "não consegui consultar", não vira tela travada.
 * - **Teto de tamanho.** Página de loja tem centenas de KB; um redirecionamento
 *   para algo gigante não pode consumir a memória do servidor.
 * - **Uma requisição por consulta, por loja.** Nada de varrer catálogo em
 *   tempo de requisição. O índice pesado é montado por script, fora do ar.
 */

const AGENTE =
  "PromoBot/1.0 (comparacao de preco para uso proprio; contato via loja)";

const TIMEOUT_MS = 12_000;

/**
 * Sitemap é outra história: são vários MB, e quem espera é um script, não uma
 * pessoa olhando a tela. Por isso o prazo é escolhido por quem chama.
 */
export const TIMEOUT_DE_SITEMAP_MS = 90_000;

/**
 * 16 MB. Página de busca da Kabum tem ~700 KB e o sitemap da Pichau ~6 MB; o
 * teto existe para barrar resposta absurda, não para apertar o caso normal.
 */
const MAXIMO_BYTES = 16 * 1024 * 1024;

export class ConsultaFalhouError extends Error {
  /**
   * Recusa explícita da loja (403, 401, 404): tentar de novo não muda nada.
   * Diferente de rede caindo ou erro 5xx, que merecem uma segunda chance.
   */
  readonly recusa: boolean;

  constructor(mensagem: string, recusa = false) {
    super(mensagem);
    this.recusa = recusa;
  }
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Uma segunda tentativa, e só uma — e nenhuma quando a loja recusou.
 *
 * A distinção importa. Rede que cai e erro 5xx são acidentes, e repetir uma
 * vez resolve. Já um 403 é a loja dizendo não: repetir não muda a resposta,
 * só insiste com quem já respondeu. O certo é aceitar e reportar.
 */
export async function baixarPagina(
  url: string,
  timeoutMs: number = TIMEOUT_MS,
  esperaAntesDeRepetirMs = 2_500,
): Promise<string> {
  try {
    return await tentar(url, timeoutMs);
  } catch (erro) {
    if (!(erro instanceof ConsultaFalhouError)) throw erro;
    if (erro.recusa) throw erro;
    await espera(esperaAntesDeRepetirMs);
    return tentar(url, timeoutMs);
  }
}

async function tentar(url: string, timeoutMs: number): Promise<string> {
  let resposta: Response;

  try {
    resposta = await fetch(url, {
      headers: {
        "User-Agent": AGENTE,
        Accept: "text/html,application/xhtml+xml,application/xml",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : "erro de rede";
    throw new ConsultaFalhouError(`não respondeu (${motivo})`);
  }

  if (!resposta.ok) {
    // 429 é "devagar", não "não": entra como acidente, e a repetição espaçada
    // é exatamente o que a loja está pedindo.
    const recusa = resposta.status >= 400 && resposta.status < 500 && resposta.status !== 429;
    throw new ConsultaFalhouError(`respondeu ${resposta.status}`, recusa);
  }

  const tamanho = Number(resposta.headers.get("content-length") ?? 0);
  if (tamanho > MAXIMO_BYTES) {
    throw new ConsultaFalhouError("resposta grande demais");
  }

  const texto = await resposta.text();

  if (texto.length > MAXIMO_BYTES) {
    throw new ConsultaFalhouError("resposta grande demais");
  }

  return texto;
}
