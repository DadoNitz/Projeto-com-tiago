/**
 * Casar o título de uma oferta com o produto certo no catálogo de uma loja.
 *
 * Esta é a peça que decide se a comparação de preço ajuda ou atrapalha. O
 * erro clássico não é não achar nada: é achar a coisa errada com confiança.
 * "RTX 4060" casa alegremente com "PC Gamer Ryzen 5, RTX 4060, 16GB" — e aí a
 * nota compara uma placa de vídeo de R$ 1.800 com um computador inteiro de
 * R$ 6.500 e conclui que a oferta é excelente.
 *
 * Por isso a pontuação olha para os dois lados:
 *
 * - **cobertura**: quanto do que eu procuro aparece no candidato;
 * - **ruído**: quanto o candidato tem além do que eu procuro.
 *
 * Um PC gamer tem cobertura alta e ruído altíssimo, e é reprovado por isso.
 *
 * E há um corte duro antes de qualquer pontuação: todo token com dígito do
 * título procurado — "4060", "5600", "b650", "16gb" — precisa aparecer no
 * candidato. Número de modelo é o que distingue uma peça da vizinha de
 * prateleira, e errar nele é errar o preço inteiro.
 */

/**
 * Marcas conhecidas, com as grafias que aparecem na prática.
 *
 * Existe por um erro real: "Monitor Gamer Philips 23.8 200Hz" casou com
 * "Monitor Gamer AOC 23.8 200Hz". Todos os números batiam, a cobertura era
 * alta, e o preço comparado era de outro produto. Marca diferente é produto
 * diferente, por mais parecida que seja a ficha técnica.
 *
 * A chave é a grafia encontrada; o valor é a marca canônica, para que
 * "phillips" (como os canais escrevem) e "philips" (como a loja escreve)
 * sejam a mesma coisa.
 */
const MARCAS = new Map<string, string>([
  ["msi", "msi"], ["asus", "asus"], ["gigabyte", "gigabyte"],
  ["asrock", "asrock"], ["galax", "galax"], ["zotac", "zotac"],
  ["pcyes", "pcyes"], ["xfx", "xfx"], ["sapphire", "sapphire"],
  ["powercolor", "powercolor"], ["evga", "evga"], ["colorful", "colorful"],
  ["kingston", "kingston"], ["crucial", "crucial"], ["corsair", "corsair"],
  ["xpg", "xpg"], ["adata", "adata"], ["sandisk", "sandisk"],
  ["seagate", "seagate"], ["netac", "netac"], ["lexar", "lexar"],
  ["patriot", "patriot"], ["husky", "husky"], ["mancer", "mancer"],
  ["intel", "intel"], ["amd", "amd"],
  ["aoc", "aoc"], ["philips", "philips"], ["phillips", "philips"],
  ["samsung", "samsung"], ["lg", "lg"], ["dell", "dell"], ["acer", "acer"],
  ["redragon", "redragon"], ["logitech", "logitech"], ["hyperx", "hyperx"],
  ["razer", "razer"], ["fortrek", "fortrek"], ["multilaser", "multilaser"],
  ["thermaltake", "thermaltake"], ["deepcool", "deepcool"],
  ["aerocool", "aerocool"], ["rise", "rise"], ["pichau", "pichau"],
  ["tplink", "tplink"], ["intelbras", "intelbras"], ["jbl", "jbl"],
  ["xiaomi", "xiaomi"], ["motorola", "motorola"], ["sony", "sony"],
]);

function marcasEm(lista: string[]): Set<string> {
  const achadas = new Set<string>();
  for (const token of lista) {
    const marca = MARCAS.get(token);
    if (marca) achadas.add(marca);
  }
  return achadas;
}

/**
 * Marcas de produto **composto**: máquina montada, combo, kit.
 *
 * Um PC gamer contém a placa de vídeo procurada, casa por cobertura e custa
 * três vezes mais. Nenhum ajuste de peso resolve isso direito, porque o
 * problema não é de grau: é de natureza. O candidato é outra coisa. Então a
 * regra é explícita — se o candidato é composto e o que eu procuro não é, não
 * são a mesma compra.
 */
const COMPOSTOS = [
  "pc gamer",
  "pc completo",
  "computador",
  "kit upgrade",
  "combo",
  "setup",
  "all in one",
  "maquina montada",
];

/** Palavras que não distinguem produto nenhum. */
const RUIDO = new Set([
  "de", "da", "do", "com", "sem", "para", "por", "em", "no", "na", "e", "ou",
  "the", "kit", "novo", "nova", "original", "lacrado", "pronta", "entrega",
  "oferta", "promocao", "desconto", "frete", "gratis", "cupom", "apenas",
  "menor", "preco", "barato", "imperdivel", "top", "melhor",
]);

export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(texto: string): string[] {
  return normalizar(texto)
    .split(" ")
    .filter((t) => t.length >= 2 && !RUIDO.has(t));
}

/** Tokens que carregam número: modelo, capacidade, geração. */
function tokensDeModelo(lista: string[]): string[] {
  return lista.filter((t) => /\d/.test(t));
}

export interface Candidato {
  nome: string;
  url: string;
  preco: number;
}

export interface Casamento<T extends Candidato = Candidato> {
  candidato: T;
  /** 0 a 1. Quanto maior, mais confiável o casamento. */
  pontuacao: number;
}

/**
 * Pontua um candidato. Devolve 0 quando o candidato deve ser recusado.
 */
export function pontuar(titulo: string, nomeDoCandidato: string): number {
  const procurados = tokens(titulo);
  const candidatos = tokens(nomeDoCandidato);

  if (procurados.length === 0 || candidatos.length === 0) return 0;

  // Corte duro: produto composto só casa com procura por produto composto.
  const normalizado = normalizar(nomeDoCandidato);
  const procurado = normalizar(titulo);
  const ehComposto = COMPOSTOS.some((marca) => normalizado.includes(marca));
  const procuraComposto = COMPOSTOS.some((marca) => procurado.includes(marca));
  if (ehComposto && !procuraComposto) return 0;

  // Corte duro: marca declarada dos dois lados precisa ser a mesma.
  //
  // Quando o candidato não declara marca nenhuma — nome vindo de slug de URL,
  // por exemplo — não há conflito a apontar, e a decisão fica com o resto da
  // pontuação. O corte é para contradição, não para ausência.
  const marcasProcuradas = marcasEm(procurados);
  const marcasCandidatas = marcasEm(candidatos);
  if (
    marcasProcuradas.size > 0 &&
    marcasCandidatas.size > 0 &&
    ![...marcasProcuradas].some((m) => marcasCandidatas.has(m))
  ) {
    return 0;
  }

  const conjuntoCandidato = new Set(candidatos);

  // Corte duro: número de modelo é obrigatório. Sem ele não é a mesma peça.
  const modelos = tokensDeModelo(procurados);
  if (modelos.some((m) => !conjuntoCandidato.has(m))) return 0;

  const conjuntoProcurado = new Set(procurados);
  const encontrados = procurados.filter((t) => conjuntoCandidato.has(t));
  const cobertura = encontrados.length / procurados.length;

  const excedentes = candidatos.filter((t) => !conjuntoProcurado.has(t));
  const ruido = excedentes.length / candidatos.length;

  // Metade do peso do ruído: descrição de loja sempre traz palavra a mais
  // ("placa de vídeo ... 128 bits"), e punir isso demais recusaria tudo.
  const pontuacao = cobertura - ruido / 2;

  // Cobertura baixa é produto diferente; pontuação baixa é produto maior que
  // o procurado (o caso do PC gamer inteiro).
  if (cobertura < 0.6 || pontuacao < 0.3) return 0;

  return Math.min(1, pontuacao);
}

/**
 * Escolhe o melhor candidato, ou `null` quando nenhum convence.
 *
 * Recusar é um resultado legítimo e frequente: melhor a nota dizer "não achei
 * esta peça nas lojas" do que comparar com o produto errado.
 */
export function escolherMelhor<T extends Candidato>(
  titulo: string,
  candidatos: T[],
): Casamento<T> | null {
  let melhor: Casamento<T> | null = null;

  for (const candidato of candidatos) {
    const pontuacao = pontuar(titulo, candidato.nome);
    if (pontuacao > 0 && (melhor === null || pontuacao > melhor.pontuacao)) {
      melhor = { candidato, pontuacao };
    }
  }

  return melhor;
}
