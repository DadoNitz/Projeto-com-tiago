/**
 * Formatação para exibição, sempre em português do Brasil.
 *
 * Centralizado para que valor em real, data e rótulo de estado apareçam
 * iguais em toda a aplicação — divergência aqui é o tipo de detalhe que faz um
 * sistema interno parecer improvisado.
 */

const MOEDA = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const MOEDA_COMPACTA = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

const DATA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Aceita `Decimal` do Prisma, número, string ou nulo.
 *
 * O Prisma devolve `Decimal` para colunas monetárias; converter na borda de
 * exibição evita espalhar `Number(...)` por todos os componentes.
 */
export type ValorMonetario =
  | number
  | string
  | { toString(): string }
  | null
  | undefined;

export function paraNumero(valor: ValorMonetario): number | null {
  if (valor === null || valor === undefined) return null;
  const numero = typeof valor === "number" ? valor : Number(valor.toString());
  return Number.isFinite(numero) ? numero : null;
}

export function formatarMoeda(valor: ValorMonetario, vazio = "—"): string {
  const numero = paraNumero(valor);
  return numero === null ? vazio : MOEDA.format(numero);
}

/** Versão curta para cartões de indicador: "R$ 12,3 mil". */
export function formatarMoedaCompacta(valor: ValorMonetario, vazio = "—"): string {
  const numero = paraNumero(valor);
  return numero === null ? vazio : MOEDA_COMPACTA.format(numero);
}

export function formatarData(valor: Date | string | null | undefined): string {
  if (!valor) return "—";
  const data = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(data.getTime()) ? "—" : DATA.format(data);
}

export function formatarDataHora(valor: Date | string | null | undefined): string {
  if (!valor) return "—";
  const data = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(data.getTime()) ? "—" : DATA_HORA.format(data);
}

/** "há 3 dias", "há 2 meses". Útil para "peças paradas". */
export function tempoRelativo(valor: Date | string | null | undefined): string {
  if (!valor) return "—";
  const data = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(data.getTime())) return "—";

  const segundos = Math.floor((Date.now() - data.getTime()) / 1000);
  const formatador = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

  const faixas: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];

  for (const [unidade, tamanho] of faixas) {
    if (Math.abs(segundos) >= tamanho) {
      return formatador.format(-Math.floor(segundos / tamanho), unidade);
    }
  }

  return "agora";
}

export function formatarNumero(valor: number): string {
  return new Intl.NumberFormat("pt-BR").format(valor);
}
