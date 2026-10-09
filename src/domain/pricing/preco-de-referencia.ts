import {
  normalizar,
  tokens,
  tokensDeModelo,
} from "@/domain/promotions/casar-produto";

/**
 * Preço de mercado de referência: a parte pura da conta.
 *
 * Quem busca os anúncios é o serviço; aqui só se decide **o que entra** na
 * média e **quanto** ela dá. Separado para ser testado sem rede.
 *
 * O risco a evitar é o mesmo da sugestão de preço de venda: um número
 * plausível e errado. Uma "RX 580" que casa com um "PC gamer com RX 580", ou
 * um anúncio de R$ 15 de cooler perdido na busca, puxariam a média para longe
 * do real — e quem olha a tela confia no número. Por isso o filtro é
 * conservador e a média descarta os extremos.
 */

/** Palavras de categoria que só atrapalham a busca nas fontes. */
const GENERICAS = new Set([
  "memoria",
  "ram",
  "placa",
  "mae",
  "video",
  "gabinete",
  "fonte",
  "generica",
  "processador",
  "cooler",
  "water",
  "ssd",
  "hd",
  "kit",
  "fan",
  "sem",
  "controladora",
  "branca",
  "branco",
  "preto",
  "preta",
  "c",
  "adaptador",
]);

/**
 * Termo de busca a partir do nome do produto.
 *
 * Tira o que está entre parênteses (anotação interna, como "confirmar
 * modelo") e as palavras de categoria. "Placa-mãe Bluecase LGA1155 (c/ slot
 * NVMe)" vira "bluecase lga1155".
 */
export function montarConsulta(nome: string, categoria?: string): string {
  const semAnotacao = nome.replace(/\([^)]*\)/g, " ");
  const palavras = normalizar(semAnotacao)
    .split(" ")
    .filter((p) => p.length > 0 && !GENERICAS.has(p));

  // Categoria entra como contexto quando o nome sozinho é vago demais
  // ("RX 580" é claro; "500W chaveada" não diz que é fonte).
  const prefixo =
    categoria === "psu" && !palavras.includes("fonte")
      ? ["fonte"]
      : categoria === "case" && palavras.length < 2
        ? ["gabinete"]
        : [];

  return [...prefixo, ...palavras].join(" ").trim();
}

/** Anúncio de PC inteiro, kit ou lote: nunca é preço de uma peça avulsa. */
const COMPOSTOS = [
  "pc gamer",
  "pc completo",
  "computador",
  "kit upgrade",
  "combo",
  "lote",
  "notebook",
  "cpu gamer",
  "desktop",
];

/** Anúncio que é peça para conserto ou acessório da peça, não a peça. */
const DEFEITO_OU_ACESSORIO = new Set([
  "defeito",
  "com problema",
  "nao liga",
  "retirada de pecas",
  "para pecas",
  "sucata",
  "suporte para",
  "backplate",
  "dissipador",
  "heatsink",
  "cabo para",
  "capa para",
  "espelho",
  "chapinha",
  "io shield",
  "i o shield",
  "substituicao",
  "fita led",
  "adesivo",
]);

/**
 * Palavras que o título precisa ter (ao menos uma) para ser da categoria.
 *
 * Sem isto, buscar "Afox" (uma placa-mãe) devolve SSD e placa de vídeo Afox,
 * e buscar um gabinete devolve a ventoinha "para gabinete" daquela marca.
 */
const PALAVRAS_DA_CATEGORIA: Record<string, string[]> = {
  motherboard: ["placa mae", "placa-mae", "placamae", "motherboard", "mainboard"],
  gpu: ["placa de video", "geforce", "radeon", "rtx", "gtx", "rx ", "rx5", "rx6", "rx7", "vga"],
  case: ["gabinete"],
  psu: ["fonte"],
  cpu: ["processador", "core i", "ryzen", "xeon", "intel core", "pentium", "celeron", "athlon"],
  ram: ["memoria", "ddr3", "ddr4", "ddr5", "ram"],
  storage: ["ssd", "hd ", "hdd", "nvme", "m 2", "disco"],
  cooler: ["cooler", "water", "watercooler", "air cooler"],
  fan: ["fan", "ventoinha", "cooler"],
};

export type Rigor = "estrito" | "aproximado";

/**
 * O anúncio é da mesma peça?
 *
 * - `estrito`: todos os números da consulta (modelo, capacidade) aparecem.
 * - `aproximado`: basta o primeiro número (o modelo principal) — usado quando
 *   o estrito não acha nada, e marcado como aproximado na tela.
 *
 * `categoria` é o slug da categoria do produto; quando informada, o título
 * precisa ser daquela categoria.
 */
export function anuncioRelevante(
  consulta: string,
  titulo: string,
  rigor: Rigor = "estrito",
  categoria?: string,
): boolean {
  const tituloNormal = normalizar(titulo);
  const consultaNormal = normalizar(consulta);

  const ehComposto = COMPOSTOS.some((c) => tituloNormal.includes(c));
  const procuraComposto = COMPOSTOS.some((c) => consultaNormal.includes(c));
  if (ehComposto && !procuraComposto) return false;

  if ([...DEFEITO_OU_ACESSORIO].some((d) => tituloNormal.includes(d))) {
    return false;
  }

  const exigidasDaCategoria = categoria
    ? PALAVRAS_DA_CATEGORIA[categoria]
    : undefined;
  if (
    exigidasDaCategoria &&
    !exigidasDaCategoria.some((p) => `${tituloNormal} `.includes(p))
  ) {
    return false;
  }

  const procurados = tokens(consulta);
  if (procurados.length === 0) return false;

  const doTitulo = new Set(tokens(titulo));
  // Título de anúncio escreve "rx580" e "rx 580" com a mesma frequência.
  const colado = tituloNormal.replace(/\s+/g, "");
  const aparece = (t: string) => doTitulo.has(t) || colado.includes(t);

  // Acessório: "Cooler Fan PARA Gabinete Aigo", "Dissipador P/ Placa H310M".
  // Quando "para"/"p" vem antes da primeira palavra procurada, o anúncio é de
  // uma coisa feita para a peça, não da peça.
  const palavras = tituloNormal.split(" ");
  const primeiraProcurada = palavras.findIndex((p) => procurados.includes(p));
  const indicePara = palavras.findIndex((p) => p === "para" || p === "p");
  if (
    indicePara !== -1 &&
    primeiraProcurada !== -1 &&
    indicePara < primeiraProcurada
  ) {
    return false;
  }

  const modelos = tokensDeModelo(procurados);
  const exigidos = rigor === "estrito" ? modelos : modelos.slice(0, 1);
  if (exigidos.some((m) => !aparece(m))) return false;

  const encontrados = procurados.filter(aparece).length;
  const cobertura = encontrados / procurados.length;
  return cobertura >= (rigor === "estrito" ? 0.6 : 0.4);
}

export interface ResumoDePrecos {
  /** Média sem os extremos, arredondada para reais inteiros. */
  media: number;
  mediana: number;
  minimo: number;
  maximo: number;
  /** Quantos preços entraram na média, depois de tirar os extremos. */
  amostras: number;
}

function mediana(ordenados: number[]): number {
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2
    ? ordenados[meio]!
    : (ordenados[meio - 1]! + ordenados[meio]!) / 2;
}

/**
 * Média robusta dos preços encontrados.
 *
 * 1. Descarta o que está fora de 50%–170% da mediana: o anúncio de R$ 15 que
 *    escapou do filtro e o de R$ 6.000 de vendedor que "não quer vender".
 * 2. Com dez ou mais preços, corta também 10% de cada ponta.
 * 3. Tira a média do que sobrou.
 *
 * Devolve `null` sem preço válido: nenhuma referência é melhor que uma
 * inventada.
 */
export function resumirPrecos(precos: number[]): ResumoDePrecos | null {
  const validos = precos
    .filter((p) => Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);
  if (validos.length === 0) return null;

  const med = mediana(validos);
  let filtrados = validos.filter((p) => p >= med * 0.5 && p <= med * 1.7);

  if (filtrados.length >= 10) {
    const corte = Math.floor(filtrados.length * 0.1);
    filtrados = filtrados.slice(corte, filtrados.length - corte);
  }

  const soma = filtrados.reduce((s, p) => s + p, 0);

  return {
    media: Math.round(soma / filtrados.length),
    mediana: Math.round(mediana(filtrados)),
    minimo: filtrados[0]!,
    maximo: filtrados[filtrados.length - 1]!,
    amostras: filtrados.length,
  };
}
