import { z } from "zod";

import type { SpecDefinition, SpecRecord, SpecValue } from "./types";

/**
 * Validação das especificações dirigida pelo catálogo.
 *
 * O schema não é escrito à mão por categoria: é construído em tempo de
 * execução a partir das `SpecDefinition`. É isso que permite criar uma
 * categoria nova sem tocar em código, mantendo validação e tipagem — a
 * alternativa (JSONB livre) aceitaria qualquer lixo e quebraria as regras de
 * compatibilidade depois, longe da causa.
 */

const TAMANHO_MAXIMO_TEXTO = 200;

/** Valores que a interface manda para "campo não preenchido". */
function estaVazio(valor: unknown): boolean {
  return (
    valor === undefined ||
    valor === null ||
    valor === "" ||
    (Array.isArray(valor) && valor.length === 0)
  );
}

function schemaDoCampo(def: SpecDefinition): z.ZodType<SpecValue> {
  switch (def.type) {
    case "NUMBER": {
      let schema = z.coerce
        .number({ message: `${def.label}: informe um número.` })
        .finite();
      if (def.min !== undefined) {
        schema = schema.min(def.min, `${def.label}: mínimo ${def.min}.`);
      }
      if (def.max !== undefined) {
        schema = schema.max(def.max, `${def.label}: máximo ${def.max}.`);
      }
      return schema;
    }

    case "BOOLEAN":
      // Formulários HTML mandam "on"/"true"; a API manda booleano.
      return z
        .union([z.boolean(), z.enum(["true", "false", "on", "off"])])
        .transform((valor) =>
          typeof valor === "boolean" ? valor : valor === "true" || valor === "on",
        );

    case "ENUM": {
      const opcoes = def.options ?? [];
      return z
        .string()
        .transform((valor) => valor.trim())
        .refine((valor) => opcoes.includes(valor), {
          message: `${def.label}: valor fora da lista permitida.`,
        });
    }

    case "MULTI_ENUM": {
      const opcoes = def.options ?? [];
      return z
        .array(z.string())
        .superRefine((valores, ctx) => {
          // Valor fora da lista é recusado, e não descartado em silêncio.
          // Descartar produziria um array vazio, que afirma "não tem nenhum" —
          // uma informação falsa, diferente de "não sabemos". O motor de
          // compatibilidade leria essa afirmação como fato.
          const invalidos = valores
            .map((valor) => valor.trim())
            .filter((valor) => valor.length > 0 && !opcoes.includes(valor));

          if (invalidos.length > 0) {
            ctx.addIssue({
              code: "custom",
              message: `${def.label}: valor fora da lista permitida (${invalidos.join(", ")}).`,
            });
          }
        })
        .transform((valores) => {
          // Remove duplicados e preserva a ordem do catálogo, para que dois
          // produtos com os mesmos valores fiquem idênticos no JSONB.
          const unicos = new Set(valores.map((valor) => valor.trim()));
          return opcoes.filter((opcao) => unicos.has(opcao));
        })
        .refine(
          (valores) => valores.length > 0 || !def.required,
          `${def.label}: selecione ao menos um valor.`,
        );
    }

    case "STRING":
      return z
        .string()
        .transform((valor) => valor.trim())
        .refine(
          (valor) => valor.length <= TAMANHO_MAXIMO_TEXTO,
          `${def.label}: máximo de ${TAMANHO_MAXIMO_TEXTO} caracteres.`,
        );
  }
}

/**
 * Constrói o validador de `Product.specs` para uma categoria.
 *
 * Chaves desconhecidas são descartadas de propósito: sem isso, um formulário
 * adulterado poderia gravar qualquer coisa dentro do JSONB.
 */
export function construirSchemaDeSpecs(
  definicoes: readonly SpecDefinition[],
): z.ZodType<SpecRecord> {
  return z
    .record(z.string(), z.unknown())
    .transform((entrada, ctx) => {
      const saida: SpecRecord = {};

      for (const def of definicoes) {
        const bruto = entrada[def.key];

        if (estaVazio(bruto)) {
          if (def.required) {
            ctx.addIssue({
              code: "custom",
              path: [def.key],
              message: `${def.label} é obrigatório.`,
            });
          }
          // Campo vazio não vira `null` no JSONB: simplesmente não existe.
          // O motor de compatibilidade trata ausência como "dado
          // insuficiente", e não como zero.
          continue;
        }

        const resultado = schemaDoCampo(def).safeParse(bruto);
        if (!resultado.success) {
          for (const issue of resultado.error.issues) {
            ctx.addIssue({
              code: "custom",
              path: [def.key],
              message: issue.message,
            });
          }
          continue;
        }

        // Lista que sobrou vazia não é gravada: `[]` afirmaria "não tem
        // nenhum", e a ausência da chave é o que significa "não sabemos".
        if (Array.isArray(resultado.data) && resultado.data.length === 0) {
          continue;
        }

        saida[def.key] = resultado.data;
      }

      return saida;
    });
}

/** Lê uma spec numérica; devolve `undefined` quando ausente ou inválida. */
export function specNumero(
  specs: SpecRecord | null | undefined,
  key: string,
): number | undefined {
  const valor = specs?.[key];
  return typeof valor === "number" && Number.isFinite(valor) ? valor : undefined;
}

/** Lê uma spec textual; devolve `undefined` quando ausente ou vazia. */
export function specTexto(
  specs: SpecRecord | null | undefined,
  key: string,
): string | undefined {
  const valor = specs?.[key];
  return typeof valor === "string" && valor.length > 0 ? valor : undefined;
}

/** Lê uma spec booleana; devolve `undefined` quando ausente. */
export function specBooleano(
  specs: SpecRecord | null | undefined,
  key: string,
): boolean | undefined {
  const valor = specs?.[key];
  return typeof valor === "boolean" ? valor : undefined;
}

/** Lê uma spec multivalorada; devolve lista vazia quando ausente. */
export function specLista(
  specs: SpecRecord | null | undefined,
  key: string,
): string[] {
  const valor = specs?.[key];
  if (!Array.isArray(valor)) return [];
  return valor.filter((item): item is string => typeof item === "string");
}
