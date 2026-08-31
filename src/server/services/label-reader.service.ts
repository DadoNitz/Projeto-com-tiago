import "server-only";

import { z } from "zod";

import { construirSchemaDeSpecs } from "@/domain/specs/validation";
import type { SpecDefinition, SpecRecord } from "@/domain/specs/types";
import { aiProvider } from "@/lib/ai";
import { RespostaInvalidaError } from "@/lib/ai/types";

import { definicoesDeSpec, listarCategorias } from "./catalog.service";

/**
 * Leitura de etiqueta por foto (seção 14).
 *
 * Três decisões que definem este módulo:
 *
 * 1. **Nada é cadastrado automaticamente.** A função devolve uma *sugestão*
 *    que preenche o formulário; quem confirma é a pessoa. A especificação é
 *    explícita, e com razão: etiqueta amassada, reflexo e serial em fonte
 *    minúscula produzem leitura errada com frequência.
 *
 * 2. **O que a IA extrai passa pela mesma validação da digitação humana.**
 *    As specs sugeridas são validadas contra o catálogo da categoria antes de
 *    voltarem para a tela. Sem isso, a IA poderia inventar um socket "AM4+" e
 *    contaminar o banco com um valor que o motor de compatibilidade não
 *    conhece — o pior tipo de erro, porque parece dado legítimo.
 *
 * 3. **Campo não lido volta ausente, não vazio.** Se o modelo não achou o
 *    serial, o campo não vem. Um serial inventado é pior que serial nenhum.
 */

export interface SugestaoDaEtiqueta {
  categorySlug?: string | undefined;
  marca?: string | undefined;
  modelo?: string | undefined;
  partNumber?: string | undefined;
  numeroSerie?: string | undefined;
  nomeSugerido?: string | undefined;
  specs: SpecRecord;
  /** Specs que a IA sugeriu mas foram recusadas pela validação. */
  specsDescartadas: string[];
  /** Texto bruto lido, para conferência humana. */
  textoLido?: string | undefined;
  observacoes?: string | undefined;
  provider: string;
  modeloIA: string;
}

const respostaSchema = z.object({
  categorySlug: z.string().optional(),
  marca: z.string().optional(),
  modelo: z.string().optional(),
  partNumber: z.string().optional(),
  numeroSerie: z.string().optional(),
  nomeSugerido: z.string().optional(),
  specs: z.record(z.string(), z.unknown()).optional(),
  textoLido: z.string().optional(),
  observacoes: z.string().optional(),
});

function instrucaoDeSistema(): string {
  return [
    "Você lê etiquetas de peças de informática e extrai os dados impressos.",
    "",
    "Regras invioláveis:",
    "- Extraia SOMENTE o que está legível na imagem. Nunca deduza, complete nem",
    "  invente um valor a partir do que é comum no mercado.",
    "- Campo ilegível ou ausente: simplesmente não inclua a chave na resposta.",
    "  Omitir é sempre melhor que chutar.",
    "- Número de série costuma vir rotulado como S/N, SN, Serial ou Serial No.",
    "  Não confunda com Part Number (P/N, PN) nem com código de barras.",
    "- Se houver mais de uma peça na foto, descreva apenas a que está em foco.",
    "- Copie o texto exatamente como impresso, preservando maiúsculas e hifens.",
    "",
    "Em 'textoLido', transcreva o que conseguiu ler na etiqueta, para que a",
    "pessoa possa conferir sua extração.",
  ].join("\n");
}

/**
 * Monta o schema JSON da resposta a partir do catálogo da categoria.
 *
 * Declarar `specs` como um objeto genérico não funciona: sem propriedades
 * tipadas, o modelo devolve `{}` — foi exatamente o que aconteceu na primeira
 * versão. Com as chaves declaradas, e os enums listados no próprio schema, o
 * modelo sabe o que procurar e o formato já sai restrito na origem.
 *
 * Isso não substitui a validação: é defesa em profundidade. O schema orienta;
 * `construirSchemaDeSpecs` é quem decide o que entra no banco.
 */
function propriedadeDaSpec(
  definicao: SpecDefinition,
): Record<string, unknown> {
  const descricao = definicao.unit
    ? `${definicao.label} (em ${definicao.unit})`
    : definicao.label;

  switch (definicao.type) {
    case "NUMBER":
      return { type: "number", description: descricao };
    case "BOOLEAN":
      return { type: "boolean", description: descricao };
    case "ENUM":
      return {
        type: "string",
        description: descricao,
        enum: [...(definicao.options ?? [])],
      };
    case "MULTI_ENUM":
      return {
        type: "array",
        description: descricao,
        items: { type: "string", enum: [...(definicao.options ?? [])] },
      };
    case "STRING":
      return { type: "string", description: descricao };
  }
}

function montarSchemaDeResposta(
  definicoes: readonly SpecDefinition[],
): Record<string, unknown> {
  const propriedadesDeSpecs: Record<string, unknown> = {};
  for (const definicao of definicoes) {
    propriedadesDeSpecs[definicao.key] = propriedadeDaSpec(definicao);
  }

  return {
    type: "object",
    properties: {
      categorySlug: { type: "string" },
      marca: { type: "string", description: "Fabricante impresso na etiqueta" },
      modelo: { type: "string", description: "Linha ou modelo do produto" },
      partNumber: {
        type: "string",
        description: "Part Number, geralmente rotulado como P/N ou PN",
      },
      numeroSerie: {
        type: "string",
        description:
          "Número de série, geralmente rotulado como S/N, SN ou Serial. Não é o Part Number.",
      },
      nomeSugerido: { type: "string" },
      ...(definicoes.length > 0
        ? {
            specs: {
              type: "object",
              description: "Somente o que estiver legível na etiqueta",
              properties: propriedadesDeSpecs,
            },
          }
        : {}),
      textoLido: {
        type: "string",
        description: "Transcrição do texto visível, para conferência humana",
      },
      observacoes: { type: "string" },
    },
  };
}

/** Descreve as specs da categoria para o modelo, com o vocabulário permitido. */
function descreverSpecs(definicoes: readonly SpecDefinition[]): string {
  if (definicoes.length === 0) return "";

  const linhas = definicoes.map((definicao) => {
    const partes = [`- ${definicao.key} (${definicao.label})`];
    if (definicao.unit) partes.push(`unidade: ${definicao.unit}`);

    if (definicao.type === "NUMBER") {
      partes.push("número");
    } else if (definicao.type === "BOOLEAN") {
      partes.push("true ou false");
    } else if (definicao.options && definicao.options.length > 0) {
      const lista = definicao.options.join(" | ");
      partes.push(
        definicao.type === "MULTI_ENUM"
          ? `lista, valores permitidos: ${lista}`
          : `um de: ${lista}`,
      );
    }

    return partes.join(" — ");
  });

  return [
    "",
    "Preencha 'specs' apenas com chaves desta lista, e apenas quando o valor",
    "estiver visível na etiqueta. Valores de lista devem ser copiados",
    "exatamente como escritos aqui:",
    ...linhas,
  ].join("\n");
}

export async function lerEtiqueta(args: {
  imagem: Buffer;
  mimeType: string;
  /** Quando a categoria já foi escolhida, a extração fica muito mais precisa. */
  categoryId?: string | undefined;
}): Promise<SugestaoDaEtiqueta> {
  const provider = aiProvider();

  const definicoes = args.categoryId
    ? await definicoesDeSpec(args.categoryId)
    : [];

  const categorias = await listarCategorias();
  const slugs = categorias.map((categoria) => categoria.slug).join(" | ");

  const instrucao = [
    args.categoryId
      ? "A categoria da peça já foi escolhida pelo usuário."
      : `Identifique a categoria. Valores possíveis: ${slugs}.`,
    descreverSpecs(definicoes),
    "",
    "Em 'nomeSugerido', monte um nome curto e comercial da peça juntando",
    "marca, linha e capacidade — como apareceria numa listagem de estoque.",
  ].join("\n");

  const resposta = await provider.gerar({
    sistema: instrucaoDeSistema(),
    mensagens: [{ papel: "user", texto: instrucao }],
    imagens: [{ dados: args.imagem, mimeType: args.mimeType }],
    // Formato estruturado obrigatório: sem isso a resposta viria em prosa e o
    // sistema teria que adivinhar onde está cada campo.
    schemaDeResposta: montarSchemaDeResposta(definicoes),
    temperatura: 0,
    // Modelos recentes gastam tokens raciocinando antes de responder. Com
    // orçamento apertado, a resposta sai truncada e o JSON vem quebrado.
    maxTokens: 8192,
  });

  let bruto: unknown;
  try {
    bruto = JSON.parse(resposta.texto);
  } catch {
    throw new RespostaInvalidaError("não veio um JSON válido");
  }

  const parsed = respostaSchema.safeParse(bruto);
  if (!parsed.success) {
    throw new RespostaInvalidaError("campos fora do formato esperado");
  }

  const { specs: specsBrutas, ...resto } = parsed.data;

  // A saída da IA passa exatamente pela mesma validação da entrada humana.
  // Uma spec inventada é recusada aqui e reportada, em vez de virar dado.
  let specs: SpecRecord = {};
  const specsDescartadas: string[] = [];

  if (specsBrutas && definicoes.length > 0) {
    const validado = construirSchemaDeSpecs(definicoes).safeParse(specsBrutas);

    if (validado.success) {
      specs = validado.data;
    } else {
      // Validação em bloco falhou: tenta campo a campo, para aproveitar o que
      // é válido em vez de descartar a leitura inteira por causa de um campo.
      for (const definicao of definicoes) {
        const valor = specsBrutas[definicao.key];
        if (valor === undefined) continue;

        const isolado = construirSchemaDeSpecs([definicao]).safeParse({
          [definicao.key]: valor,
        });

        if (isolado.success && isolado.data[definicao.key] !== undefined) {
          specs[definicao.key] = isolado.data[definicao.key]!;
        } else {
          specsDescartadas.push(definicao.label);
        }
      }
    }
  }

  return {
    ...resto,
    specs,
    specsDescartadas,
    provider: resposta.provider,
    modeloIA: resposta.modelo,
  };
}
