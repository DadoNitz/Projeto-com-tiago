import type { SpecRecord } from "../specs/types";

/**
 * Tipos do motor de compatibilidade.
 *
 * Módulo puro: sem banco, sem IA, sem I/O. É o que permite testar
 * exaustivamente a regra que, errada, faz alguém comprar a peça errada ou
 * montar um computador que não liga.
 */

/**
 * Os quatro níveis pedidos pela seção 6 da especificação.
 *
 * A distinção que sustenta o sistema inteiro é entre `INCOMPATIBLE` e
 * `NEEDS_VERIFICATION`: a primeira afirma que não funciona; a segunda admite
 * que não sabemos. Confundi-las seria mentir com aparência de precisão.
 */
export type NivelCompatibilidade =
  | "COMPATIBLE"
  | "LIKELY_COMPATIBLE"
  | "NEEDS_VERIFICATION"
  | "INCOMPATIBLE";

/**
 * Ordem de severidade. O veredito de uma montagem é o **pior** de seus checks:
 * uma incompatibilidade não é compensada por dez acertos.
 */
const SEVERIDADE: Record<NivelCompatibilidade, number> = {
  COMPATIBLE: 0,
  LIKELY_COMPATIBLE: 1,
  NEEDS_VERIFICATION: 2,
  INCOMPATIBLE: 3,
};

export function piorNivel(
  niveis: readonly NivelCompatibilidade[],
): NivelCompatibilidade {
  return niveis.reduce<NivelCompatibilidade>(
    (pior, atual) => (SEVERIDADE[atual] > SEVERIDADE[pior] ? atual : pior),
    "COMPATIBLE",
  );
}

export const ROTULO_NIVEL: Record<NivelCompatibilidade, string> = {
  COMPATIBLE: "Compatível",
  LIKELY_COMPATIBLE: "Provavelmente compatível",
  NEEDS_VERIFICATION: "Precisa verificar",
  INCOMPATIBLE: "Incompatível",
};

/** Uma peça candidata a entrar numa montagem. */
export interface Componente {
  /** Identifica a peça na interface e no resultado. */
  id: string;
  nome: string;
  categorySlug: string;
  specs: SpecRecord;
}

/**
 * Uma montagem candidata.
 *
 * `ram` e `storage` são listas porque uma máquina leva vários pentes e vários
 * discos, e as regras de slot precisam contar o conjunto.
 */
export interface MontagemCandidata {
  cpu?: Componente | undefined;
  motherboard?: Componente | undefined;
  ram: Componente[];
  gpu?: Componente | undefined;
  storage: Componente[];
  psu?: Componente | undefined;
  case?: Componente | undefined;
  cooler?: Componente | undefined;
}

export interface ResultadoDeRegra {
  /** Identificador estável da regra, para testes e para a interface. */
  regra: string;
  titulo: string;
  nivel: NivelCompatibilidade;
  /** Explicação em português, escrita para o usuário final. */
  mensagem: string;
  /**
   * Campos de especificação que faltavam para decidir.
   *
   * É o que transforma "precisa verificar" em ação concreta: a interface
   * mostra exatamente o que preencher no cadastro para obter uma resposta
   * definitiva.
   */
  camposFaltando?: string[];
}

export interface ResultadoDeCompatibilidade {
  nivel: NivelCompatibilidade;
  checks: ResultadoDeRegra[];
  /** Consumo estimado em watts, somando o que se sabe. */
  consumoEstimadoW: number;
  /** Potência de fonte recomendada, com folga. */
  fonteRecomendadaW: number;
  /** Papéis essenciais ausentes na montagem (ex.: "Fonte"). */
  pecasFaltando: string[];
}

/** Contexto passado a cada regra. */
export type Regra = (montagem: MontagemCandidata) => ResultadoDeRegra | null;
