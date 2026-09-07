import "server-only";

import { z } from "zod";

import { CATEGORIAS } from "@/domain/promotions/categorias";
import { valeChamarIA } from "@/domain/promotions/pre-filtro";
import { aiProvider, iaDisponivel } from "@/lib/ai";
import { RespostaInvalidaError } from "@/lib/ai/types";

/**
 * Leitura de anúncio de promoção escrito por gente.
 *
 * Mensagem de grupo de promoção não tem formato. Ela chega assim:
 *
 *   🔥🔥 RTX 4060 VENTUS 2X na Kabum
 *   De R$ 2.199 por R$ 1.799 no PIX
 *   Cupom KABUM50 · frete grátis
 *   https://...
 *
 * Nenhuma expressão regular sobrevive a isso por muito tempo: cada grupo
 * escreve de um jeito, usa emoji diferente, inverte a ordem, escreve "1,8k".
 * A extração por modelo lida com a variação — é o mesmo motivo pelo qual ela
 * é usada para ler etiqueta.
 *
 * Como na etiqueta, o que o modelo devolve **não** é aceito de olhos
 * fechados: preço vira número validado, e anúncio sem preço é descartado em
 * vez de virar promoção com valor zero.
 */

export interface PromocaoExtraida {
  title: string;
  currentPrice: number;
  regularPrice?: number | undefined;
  storeName?: string | undefined;
  categorySlug?: string | undefined;
  /** Link para abrir no computador. */
  url?: string | undefined;
  /** Link do aplicativo, quando o anúncio traz um separado. */
  appUrl?: string | undefined;
  coupon?: string | undefined;
  /** Confiança do modelo, para descartar leitura duvidosa. */
  confianca: "alta" | "media" | "baixa";
}

const respostaSchema = z.object({
  ehOfertaRelevante: z.boolean(),
  title: z.string().optional(),
  currentPrice: z.number().positive().optional(),
  regularPrice: z.number().positive().optional(),
  storeName: z.string().optional(),
  categorySlug: z.string().optional(),
  url: z.string().optional(),
  appUrl: z.string().optional(),
  coupon: z.string().optional(),
  confianca: z.enum(["alta", "media", "baixa"]).optional(),
});

const INSTRUCAO = [
  "Você lê mensagens de grupos de promoção e extrai a oferta.",
  "",
  "Interessa duas famílias de produto:",
  "- peça de PC e periférico: processador, placa de vídeo, placa-mãe,",
  "  memória, SSD, fonte, gabinete, cooler, monitor, teclado, mouse,",
  "  headset, notebook;",
  "- eletrônico de consumo: TV, celular, tablet, fone, caixa de som,",
  "  videogame e controle, projetor, power bank, carregador, nobreak,",
  "  smartwatch, roteador, casa inteligente.",
  "",
  "Responda `ehOfertaRelevante: false` e mais nada quando a mensagem:",
  "- não for uma oferta (conversa, bom dia, agradecimento, enquete);",
  "- for de produto fora das duas famílias acima (perfume, roupa, mercado,",
  "  eletrodoméstico de cozinha, móvel, pet, suplemento, livro impresso);",
  "- não trouxer preço legível.",
  "",
  "Regras de extração:",
  "- `currentPrice` é o preço que se paga HOJE. Se houver preço no PIX e",
  "  preço parcelado, use o do PIX/à vista.",
  "- `regularPrice` só quando a mensagem disser o preço anterior (\"de R$ X\",",
  "  \"era R$ X\"). Nunca estime.",
  "- Converta \"1,8k\" e \"1.8k\" para 1800. Vírgula é decimal: \"1.799,90\" é",
  "  1799.90.",
  "- `url` só se houver link na mensagem. Não invente.",
  "",
  "Alguns anúncios trazem DOIS links, um para cada jeito de comprar:",
  '  "Link App com desconto em moedas" -> `appUrl`',
  '  "Link para PC / sem super desconto moedas" -> `url`',
  "Quando houver os dois, preencha os dois — eles levam a preços diferentes,",
  "e o do app costuma ser o mais barato. Com um link só, use `url`.",
  "- `confianca: baixa` quando o preço ou o produto estiverem ambíguos.",
  "",
  `Categorias válidas: ${CATEGORIAS.join(", ")}.`,
  'Use "outros" para peça de PC que não encaixa nas demais, e',
  '"eletronico-outros" para eletrônico que não encaixa. A categoria decide em',
  "que aba a oferta aparece, então não chute entre as duas famílias: peça de",
  "PC nunca recebe categoria de eletrônico, e vice-versa.",
].join("\n");

const SCHEMA_DE_RESPOSTA = {
  type: "object",
  properties: {
    ehOfertaRelevante: { type: "boolean" },
    title: {
      type: "string",
      description: "Nome do produto, limpo de emoji e de texto promocional",
    },
    currentPrice: { type: "number", description: "Preço atual, à vista" },
    regularPrice: { type: "number", description: "Preço anterior, se declarado" },
    storeName: { type: "string", description: "Loja, se mencionada" },
    categorySlug: { type: "string", enum: [...CATEGORIAS] },
    url: {
      type: "string",
      description: "Link para computador, ou o único link quando só houver um",
    },
    appUrl: {
      type: "string",
      description: "Link do aplicativo, só quando o anúncio trouxer um à parte",
    },
    coupon: { type: "string" },
    confianca: { type: "string", enum: ["alta", "media", "baixa"] },
  },
  required: ["ehOfertaRelevante"],
};

/**
 * Extrai a oferta de uma mensagem.
 *
 * Devolve `null` quando a mensagem não é uma oferta que interessa — que é
 * a maioria do tráfego de um grupo. Descartar cedo evita encher o sistema de
 * ruído e gastar avaliação de IA com perfume em oferta.
 */
export async function extrairPromocao(
  texto: string,
): Promise<PromocaoExtraida | null> {
  if (!iaDisponivel()) return null;

  const limpo = texto.trim();

  // Filtro determinístico antes da IA. A cota do plano gratuito é o recurso
  // escasso: um grupo de promoções manda dezenas de mensagens por hora, e a
  // maioria não é oferta nenhuma. Ver `pre-filtro.ts`.
  if (!valeChamarIA(limpo).vale) return null;

  // Modelo de lote: cota diária separada da leitura de etiqueta e do chat.
  // Um dia agitado no grupo não pode derrubar o trabalho de quem está
  // cadastrando peça com o sistema aberto.
  const resposta = await aiProvider("lote").gerar({
    sistema: INSTRUCAO,
    mensagens: [{ papel: "user", texto: limpo }],
    schemaDeResposta: SCHEMA_DE_RESPOSTA,
    temperatura: 0,
    maxTokens: 2048,
  });

  let bruto: unknown;
  try {
    bruto = JSON.parse(resposta.texto);
  } catch {
    throw new RespostaInvalidaError("a leitura da promoção não veio em JSON");
  }

  const parsed = respostaSchema.safeParse(bruto);
  if (!parsed.success) return null;

  const dados = parsed.data;

  if (!dados.ehOfertaRelevante) return null;

  // Sem título ou sem preço não existe promoção. Registrar com preço zero
  // criaria uma "oferta" que a avaliação trataria como boa demais.
  if (!dados.title || dados.currentPrice === undefined) return null;

  // Preço anterior menor que o atual é leitura errada — os dois foram
  // trocados, ou o modelo pegou o valor da parcela.
  const regular =
    dados.regularPrice !== undefined && dados.regularPrice > dados.currentPrice
      ? dados.regularPrice
      : undefined;

  return {
    title: dados.title.slice(0, 200),
    currentPrice: dados.currentPrice,
    regularPrice: regular,
    storeName: dados.storeName,
    categorySlug: dados.categorySlug,
    url: dados.url,
    appUrl: dados.appUrl,
    coupon: dados.coupon,
    confianca: dados.confianca ?? "media",
  };
}
