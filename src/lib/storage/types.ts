/**
 * Contrato de armazenamento de arquivos.
 *
 * A aplicação nunca sabe onde o arquivo está: ela guarda uma *chave* no banco
 * e pede o conteúdo por ela. Trocar de provedor é implementar esta interface e
 * mudar `STORAGE_DRIVER` no ambiente — sem migration, sem tocar nas telas.
 *
 * É por isso que `ProductImage` guarda `storageKey` e não uma URL: URL amarra
 * o banco ao provedor, e uma troca de provedor invalidaria todas as linhas.
 */

export interface ArquivoArmazenado {
  key: string;
  sizeBytes: number;
  contentType: string;
}

export interface StorageProvider {
  /** Nome do driver, para diagnóstico. */
  readonly nome: string;

  put(
    key: string,
    dados: Buffer,
    contentType: string,
  ): Promise<ArquivoArmazenado>;

  /** Conteúdo bruto, para servir por rota autenticada. */
  get(key: string): Promise<{ dados: Buffer; contentType: string } | null>;

  remove(key: string): Promise<void>;
}

/** Tipos de imagem aceitos no upload. */
export const MIMES_ACEITOS = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export type MimeAceito = (typeof MIMES_ACEITOS)[number];
