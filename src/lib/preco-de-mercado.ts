/**
 * Tipos e regras do preço de mercado compartilhados entre servidor e tela.
 * Fora do componente cliente porque a página (servidor) também decide se a
 * busca está em andamento.
 */

export interface ReferenciaDeMercado {
  valor: number | null;
  /** "USADO" | "NOVO" */
  tipo: string | null;
  /** PENDING | OK | NOT_FOUND | FAILED | null (nunca buscado) */
  status: string | null;
  /** Quando foi buscado (ISO). */
  em?: string | null;
  /** De onde o número saiu. Ausente em dados de antes deste formato. */
  dados?: DadosDoPrecoDeMercado | null;
}

/** Como a tela lê `Product.referencePriceData`. Campos novos são opcionais. */
export interface DadosDoPrecoDeMercado {
  consulta?: string;
  rigor?: "estrito" | "aproximado" | null;
  condicao?: string | null;
  resumo?: {
    media: number;
    mediana: number;
    minimo: number;
    maximo: number;
    amostras: number;
  } | null;
  encontrados?: number;
  anuncios?: {
    fonte: string;
    titulo: string;
    preco: number;
    url: string;
    entrou?: boolean;
  }[];
  falhas?: { fonte: string; motivo: string }[];
}

/** Lê o JSON salvo sem confiar no formato: dado velho não pode quebrar a tela. */
export function lerDadosDoPreco(valor: unknown): DadosDoPrecoDeMercado | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  return valor as DadosDoPrecoDeMercado;
}

/** Pendência mais velha que isso foi abandonada pelo worker. */
const PENDENCIA_ABANDONADA_MS = 15 * 60 * 1000;

export function estaBuscando(
  status: string | null,
  desde: Date | string | null,
): boolean {
  if (status !== "PENDING") return false;
  if (!desde) return true;
  return Date.now() - new Date(desde).getTime() < PENDENCIA_ABANDONADA_MS;
}
