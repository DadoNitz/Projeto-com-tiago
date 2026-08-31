/**
 * Número de série e código interno.
 *
 * A especificação (seção 3) pede um campo separado com os últimos caracteres
 * do serial, e o motivo é prático: é assim que a peça é identificada no mundo
 * físico. Ninguém lê os 20 caracteres da etiqueta — lê os quatro últimos.
 *
 * Guardar isso em coluna própria e indexada, em vez de buscar com
 * `LIKE '%7812'`, é o que mantém a busca rápida: um LIKE com curinga à
 * esquerda não usa índice e faz varredura completa da tabela.
 */

/** Quantos caracteres finais são guardados para busca rápida. */
export const TAMANHO_SERIAL_FINAL = 6;

/**
 * Extrai os últimos caracteres significativos de um número de série.
 *
 * Normaliza para maiúsculas e descarta separadores, porque a mesma peça pode
 * ser cadastrada como "SN: 1234-5678" por uma pessoa e "123456 78" por outra.
 */
export function derivarSerialFinal(
  serial: string | null | undefined,
): string | null {
  if (!serial) return null;

  const limpo = serial.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (limpo.length === 0) return null;

  return limpo.slice(-TAMANHO_SERIAL_FINAL);
}

/**
 * Normaliza o texto digitado numa busca por final de serial, para que ele
 * possa ser comparado com o que foi gravado.
 */
export function normalizarBuscaSerial(termo: string): string {
  return termo.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Prefixo do código interno. Aparece na etiqueta e dentro do QR Code. */
export const PREFIXO_CODIGO_INTERNO = "EST";

/**
 * Monta o código interno a partir de um número sequencial.
 *
 * Zero à esquerda até 5 dígitos mantém os códigos alinhados na etiqueta e
 * ordenáveis como texto.
 */
export function formatarCodigoInterno(sequencial: number): string {
  return `${PREFIXO_CODIGO_INTERNO}-${String(sequencial).padStart(5, "0")}`;
}

/**
 * Conteúdo do QR Code de uma unidade.
 *
 * Deliberadamente não é uma URL: o domínio do sistema pode mudar, e etiquetas
 * já impressas e coladas em peças não podem ser reimpressas por causa disso.
 * O leitor do próprio sistema interpreta este código e navega para a unidade.
 */
export function conteudoQrCode(codigoInterno: string): string {
  return `INV-${codigoInterno}`;
}

/** Lê um QR Code lido pela câmera e devolve o código interno, se for válido. */
export function lerQrCode(conteudo: string): string | null {
  const texto = conteudo.trim().toUpperCase();

  const comPrefixo = texto.match(/^INV-([A-Z]+-\d+)$/);
  if (comPrefixo?.[1]) return comPrefixo[1];

  // Também aceita o código interno digitado ou lido diretamente, sem o
  // prefixo do QR — é o que acontece quando alguém digita da etiqueta.
  const direto = texto.match(/^[A-Z]+-\d+$/);
  if (direto) return texto;

  return null;
}
