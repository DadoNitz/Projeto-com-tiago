/**
 * Categorias de promoção, e a que segmento cada uma pertence.
 *
 * O sistema nasceu olhando só para peça de PC, porque é o que se revende. Mas
 * os canais de promoção misturam controle, TV, fone e projetor no mesmo fluxo,
 * e recusar tudo isso jogava fora oferta que interessa.
 *
 * A saída não é misturar: é separar. Cada promoção guarda sua categoria, e a
 * tela filtra por segmento. Assim o trabalho do dia a dia — achar peça barata
 * para montar e revender — não fica diluído numa lista de power bank, e o
 * eletrônico continua acessível a um clique.
 *
 * A lista vive aqui, e não dentro do parser de IA, porque três lugares
 * dependem dela: o `enum` que restringe a resposta do modelo, a consulta que
 * filtra a tela, e o rótulo que a pessoa lê. Uma lista só evita o caso clássico
 * de o modelo devolver uma categoria que a tela não sabe exibir.
 */

/** Peça de PC e periférico: o núcleo da operação. */
export const CATEGORIAS_DE_PC = [
  "cpu",
  "motherboard",
  "ram",
  "gpu",
  "storage",
  "psu",
  "case",
  "cooler",
  "monitor",
  "peripheral",
  "notebook",
  "outros",
] as const;

/** Eletrônico de consumo: interessa, mas não é o foco. */
export const CATEGORIAS_DE_ELETRONICO = [
  "tv",
  "celular",
  "audio",
  "videogame",
  "projetor",
  "energia",
  "vestivel",
  "casa-inteligente",
  "eletronico-outros",
] as const;

export const CATEGORIAS = [
  ...CATEGORIAS_DE_PC,
  ...CATEGORIAS_DE_ELETRONICO,
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

export type Segmento = "pc" | "eletronico";

/** O que a pessoa lê na tela. */
export const ROTULO_DA_CATEGORIA: Record<Categoria, string> = {
  cpu: "Processador",
  motherboard: "Placa-mãe",
  ram: "Memória",
  gpu: "Placa de vídeo",
  storage: "Armazenamento",
  psu: "Fonte",
  case: "Gabinete",
  cooler: "Cooler",
  monitor: "Monitor",
  peripheral: "Periférico",
  notebook: "Notebook",
  outros: "Outra peça",
  tv: "TV",
  celular: "Celular",
  audio: "Áudio",
  videogame: "Videogame",
  projetor: "Projetor",
  energia: "Energia",
  vestivel: "Vestível",
  "casa-inteligente": "Casa inteligente",
  "eletronico-outros": "Outro eletrônico",
};

const DE_ELETRONICO: ReadonlySet<string> = new Set(CATEGORIAS_DE_ELETRONICO);

/**
 * Segmento de uma categoria.
 *
 * Cai em `pc` quando a categoria é nula ou desconhecida — e isso é
 * deliberado. Promoção cadastrada à mão não tem categoria, e sumir da tela
 * principal seria pior do que aparecer no segmento errado: a pessoa acabou de
 * digitar aquilo e espera vê-lo.
 */
export function segmentoDaCategoria(slug: string | null | undefined): Segmento {
  return slug && DE_ELETRONICO.has(slug) ? "eletronico" : "pc";
}

export function rotuloDaCategoria(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return ROTULO_DA_CATEGORIA[slug as Categoria] ?? null;
}
