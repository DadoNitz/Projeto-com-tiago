/**
 * Tipos do catálogo de especificações.
 *
 * Este módulo é puro: sem Prisma, sem React, sem I/O. O motor de
 * compatibilidade (Fase 2) e os formulários dinâmicos leem daqui, e os testes
 * rodam sem banco.
 */

export const SPEC_TYPES = [
  "STRING",
  "NUMBER",
  "BOOLEAN",
  "ENUM",
  "MULTI_ENUM",
] as const;

export type SpecType = (typeof SPEC_TYPES)[number];

/** Valor que uma especificação pode assumir dentro de `Product.specs`. */
export type SpecValue = string | number | boolean | string[];

/** Objeto de especificações de um produto, como persistido no JSONB. */
export type SpecRecord = Record<string, SpecValue>;

/**
 * Descrição de uma especificação de uma categoria.
 *
 * Espelha o modelo `SpecDefinition` do banco, mas sem depender dele — assim o
 * domínio permanece testável isoladamente.
 */
export interface SpecDefinition {
  key: string;
  label: string;
  type: SpecType;
  unit?: string;
  required?: boolean;
  /** Vocabulário controlado para ENUM e MULTI_ENUM. */
  options?: readonly string[];
  /**
   * Marca as specs lidas pelo motor de compatibilidade.
   *
   * Elas precisam ser ENUM, MULTI_ENUM ou NUMBER: texto livre reintroduziria
   * o problema de "AM4" e "Socket AM4" serem valores diferentes, e a regra
   * falharia em silêncio — o pior modo de falha possível aqui, porque o
   * usuário confia no resultado.
   */
  usedInCompatibility?: boolean;
  helpText?: string;
  /** Limites de sanidade para NUMBER; evitam erro de digitação absurdo. */
  min?: number;
  max?: number;
  sortOrder?: number;
}

/** Uma categoria do catálogo padrão, com suas especificações. */
export interface CategoryDefinition {
  /** Contrato estável entre catálogo e regras de compatibilidade. */
  slug: string;
  name: string;
  description?: string;
  /** Ícone do lucide-react usado na navegação. */
  icon?: string;
  sortOrder?: number;
  specs: readonly SpecDefinition[];
}
