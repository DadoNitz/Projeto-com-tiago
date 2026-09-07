/**
 * Sugestão de preço de venda.
 *
 * ## Por que a conta é feita aqui, e não pela IA
 *
 * Preço é a única informação do anúncio que custa dinheiro quando sai errada.
 * Um modelo de linguagem chuta preço com a mesma confiança com que escreve
 * texto — e chuta pelo que viu na internet, não pelo que esta operação pagou
 * nas peças. Errar para baixo é vender no prejuízo; errar para cima é o
 * anúncio ficar parado. Por isso o número sai daqui, de aritmética sobre dados
 * do próprio banco, e a IA só recebe o valor pronto para escrever.
 *
 * ## As três referências
 *
 * A tela não mostra "o preço": mostra três, porque é assim que a venda
 * acontece de verdade num marketplace.
 *
 * - **anúncio**: o que vai no anúncio. Fica acima do alvo porque comprador
 *   negocia; anunciar já no limite significa fechar abaixo dele.
 * - **alvo**: o valor que se espera fechar.
 * - **mínimo**: abaixo disto a montagem não paga o trabalho. Não é o custo —
 *   vender pelo custo é trocar estoque por nada.
 *
 * ## De onde sai o alvo
 *
 * Na ordem da qualidade da evidência:
 *
 * 1. **Histórico** — quando esta operação já vendeu montagens suficientes, a
 *    razão entre o que se vendeu e o que custou é o melhor parâmetro que
 *    existe: é o preço que *este* público aceitou pagar. Nenhuma constante
 *    escrita em código ganha disso.
 * 2. **Peças** — a soma do preço de venda estimado de cada peça, mais o prêmio
 *    de montagem.
 * 3. **Custo** — quando não há preço estimado nem histórico. É o pior caso, e
 *    a sugestão declara isso na confiança.
 */

/** Uma peça da montagem, ou a peça avulsa que está sendo anunciada. */
export interface PecaPrecificada {
  /** O que esta operação pagou. */
  custo: number | null;
  /** Preço de venda estimado no cadastro. */
  precoEstimado: number | null;
}

/** Uma venda já registrada, usada como parâmetro. */
export interface VendaAnterior {
  custo: number;
  preco: number;
}

export type BaseDoPreco = "historico" | "pecas" | "custo";
export type Confianca = "alta" | "media" | "baixa";

export interface SugestaoDePreco {
  /** Valor para pôr no anúncio. */
  anuncio: number;
  /** Valor que se espera fechar depois da negociação. */
  alvo: number;
  /** Abaixo disto, não vale a venda. */
  minimo: number;
  /** Soma do que as peças custaram. Zero quando nenhuma tem custo cadastrado. */
  custo: number;
  base: BaseDoPreco;
  confianca: Confianca;
  /** Como os números foram obtidos, em português, para aparecer na tela. */
  motivos: string[];
}

/**
 * Margem mínima sobre o custo.
 *
 * Existe para impedir o caso que o resto da conta não impede sozinho: peças
 * caras com preço estimado baixo produziriam um alvo abaixo do custo, e o
 * sistema estaria sugerindo prejuízo com cara de recomendação.
 */
const MARGEM_MINIMA = 0.2;

/**
 * Prêmio de montagem sobre a soma das peças.
 *
 * Montar, testar e instalar o sistema é trabalho que o comprador não vai ter —
 * e um PC pronto encontra comprador que não compraria oito peças soltas. É
 * pouco de propósito: quem infla este número descobre o erro em forma de
 * anúncio parado.
 */
const PREMIO_DE_MONTAGEM = 0.12;

/** Espaço para o comprador negociar sem levar o preço abaixo do alvo. */
const ESPACO_DE_NEGOCIACAO = 0.1;

/** Peça sem preço estimado entra pelo custo, com margem conservadora. */
const SEM_PRECO_ESTIMADO = 1.4;

/**
 * Vendas necessárias para o histórico valer mais que a conta das peças.
 *
 * Com uma ou duas vendas a mediana é a própria venda — uma pechincha para um
 * amigo viraria regra para todas as próximas.
 */
const MINIMO_DE_VENDAS = 3;

/**
 * Sugere o preço de uma montagem ou de uma peça avulsa.
 *
 * Devolve `null` quando não há nada em que se apoiar: nenhuma peça com custo
 * nem com preço estimado. Preço inventado é pior que preço nenhum — em branco
 * a pessoa pesquisa, com um número errado na tela ela confia.
 */
export function sugerirPreco(
  pecas: readonly PecaPrecificada[],
  vendasAnteriores: readonly VendaAnterior[] = [],
  opcoes: { montada?: boolean } = {},
): SugestaoDePreco | null {
  if (pecas.length === 0) return null;

  const custo = somar(pecas.map((peca) => peca.custo ?? 0));

  const semPrecoEstimado = pecas.filter(
    (peca) => peca.precoEstimado === null || peca.precoEstimado <= 0,
  ).length;

  const valorDasPecas = somar(
    pecas.map((peca) =>
      peca.precoEstimado && peca.precoEstimado > 0
        ? peca.precoEstimado
        : (peca.custo ?? 0) * SEM_PRECO_ESTIMADO,
    ),
  );

  if (custo <= 0 && valorDasPecas <= 0) return null;

  const razao = razaoHistorica(vendasAnteriores);
  const motivos: string[] = [];

  let alvo: number;
  let base: BaseDoPreco;

  if (razao !== null && custo > 0) {
    alvo = custo * razao;
    base = "historico";
    motivos.push(
      `Nas ${vendasAnteriores.length} vendas anteriores, o valor fechado ficou ` +
        `em média ${porcentagem(razao - 1)} acima do custo. O alvo aplica essa ` +
        "mesma razão.",
    );
  } else {
    alvo = opcoes.montada
      ? valorDasPecas * (1 + PREMIO_DE_MONTAGEM)
      : valorDasPecas;

    // Quando nenhuma peça tem preço de venda cadastrado, a soma acima é só o
    // custo multiplicado por uma constante. Continua sendo a melhor conta
    // disponível, mas é chute com aparência de cálculo — e a tela precisa
    // poder dizer isso.
    base = semPrecoEstimado === pecas.length ? "custo" : "pecas";

    motivos.push(
      base === "custo"
        ? "Nenhuma peça tem preço de venda estimado e não há histórico de " +
            "vendas: o alvo é o custo com margem. Pesquise antes de anunciar."
        : opcoes.montada
          ? `Soma do preço de venda das ${pecas.length} peças, mais ` +
            `${porcentagem(PREMIO_DE_MONTAGEM)} pelo trabalho de montar e testar.`
          : "Preço de venda estimado no cadastro da peça.",
    );
  }

  const minimo = paraCima(custo * (1 + MARGEM_MINIMA));

  if (alvo < minimo) {
    motivos.push(
      "O alvo calculado ficava abaixo do custo mais a margem mínima e foi " +
        "elevado até ela.",
    );
    alvo = minimo;
  }

  if (base === "pecas" && semPrecoEstimado > 0) {
    motivos.push(
      semPrecoEstimado === 1
        ? "1 peça não tem preço de venda cadastrado e entrou pelo custo."
        : `${semPrecoEstimado} peças não têm preço de venda cadastrado e entraram pelo custo.`,
    );
  }

  motivos.push(
    custo > 0
      ? `Custo das peças somado; o mínimo é ele mais ${porcentagem(MARGEM_MINIMA)}.`
      : "Nenhuma peça tem custo de compra cadastrado, então não há piso calculado.",
  );

  return {
    anuncio: arredondar(alvo * (1 + ESPACO_DE_NEGOCIACAO)),
    alvo: arredondar(alvo),
    minimo,
    custo,
    base,
    confianca: avaliarConfianca({
      base,
      custo,
      totalDePecas: pecas.length,
      semPrecoEstimado,
    }),
    motivos,
  };
}

/**
 * Razão mediana entre preço de venda e custo nas vendas anteriores.
 *
 * Mediana, e não média: uma montagem vendida com desconto grande puxaria a
 * média para baixo e passaria a subprecificar todas as próximas.
 */
function razaoHistorica(vendas: readonly VendaAnterior[]): number | null {
  const razoes = vendas
    .filter((venda) => venda.custo > 0 && venda.preco > 0)
    .map((venda) => venda.preco / venda.custo)
    .sort((a, b) => a - b);

  if (razoes.length < MINIMO_DE_VENDAS) return null;

  const meio = Math.floor(razoes.length / 2);
  const mediana =
    razoes.length % 2 === 0
      ? ((razoes[meio - 1] ?? 0) + (razoes[meio] ?? 0)) / 2
      : (razoes[meio] ?? 0);

  return mediana > 0 ? mediana : null;
}

function avaliarConfianca(args: {
  base: BaseDoPreco;
  custo: number;
  totalDePecas: number;
  semPrecoEstimado: number;
}): Confianca {
  if (args.base === "custo" || args.custo <= 0) return "baixa";
  if (args.semPrecoEstimado > args.totalDePecas / 2) return "baixa";
  if (args.semPrecoEstimado > 0) return "media";
  return args.base === "historico" ? "alta" : "media";
}

function somar(valores: readonly number[]): number {
  return centavos(valores.reduce((soma, valor) => soma + valor, 0));
}

function porcentagem(fracao: number): string {
  return `${Math.round(fracao * 100)}%`;
}

/**
 * Preço de anúncio termina em dezena.
 *
 * "R$ 2.347,83" denuncia planilha e convida a pechinchar sobre o centavo.
 */
function arredondar(valor: number): number {
  return Math.round(valor / 10) * 10;
}

/** O piso arredonda para cima: para baixo, o arredondamento baixaria o piso. */
function paraCima(valor: number): number {
  return Math.ceil(valor / 10) * 10;
}

function centavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}
