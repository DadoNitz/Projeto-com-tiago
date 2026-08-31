import type { MovementType, UnitStatus } from "@/generated/prisma/enums";

/**
 * Regras de transição de estado do estoque.
 *
 * Módulo puro, sem banco: é a regra mais crítica do sistema (seção 29) e
 * precisa ser testável isoladamente. Inconsistência aqui não gera só um bug de
 * tela — corrompe o inventário e faz a IA responder sobre um estoque que não
 * existe.
 */

/** Status a partir dos quais nada mais acontece com a unidade. */
export const STATUS_TERMINAIS: readonly UnitStatus[] = ["DISCARDED"];

interface RegraDeMovimento {
  /** Status aceitos como origem. `null` significa "qualquer origem". */
  de: readonly UnitStatus[] | null;
  /** Status resultante. `"manter"` preserva o status atual. */
  para: UnitStatus | "manter";
  /** Descrição usada nas mensagens de erro e na interface. */
  rotulo: string;
  /** Movimentos que retiram a peça do estoque disponível. */
  consomeDisponibilidade: boolean;
}

/**
 * Tabela de transições.
 *
 * Escrita como dado, e não como uma cascata de `if`, para que a regra seja
 * legível de uma vez só e testável exaustivamente.
 */
export const REGRAS_DE_MOVIMENTO: Record<MovementType, RegraDeMovimento> = {
  INBOUND: {
    de: ["IN_TRANSIT"],
    para: "AVAILABLE",
    rotulo: "Entrada",
    consomeDisponibilidade: false,
  },
  OUTBOUND: {
    de: ["AVAILABLE", "RESERVED"],
    para: "IN_TRANSIT",
    rotulo: "Saída",
    consomeDisponibilidade: true,
  },
  SALE: {
    de: ["AVAILABLE", "RESERVED", "IN_BUILD", "IN_TRANSIT"],
    para: "SOLD",
    rotulo: "Venda",
    consomeDisponibilidade: true,
  },
  RESERVE: {
    // Só o que está livre pode ser reservado. É esta linha que impede a mesma
    // peça de ser prometida a dois clientes.
    de: ["AVAILABLE"],
    para: "RESERVED",
    rotulo: "Reserva",
    consomeDisponibilidade: true,
  },
  UNRESERVE: {
    de: ["RESERVED"],
    para: "AVAILABLE",
    rotulo: "Cancelamento de reserva",
    consomeDisponibilidade: false,
  },
  RETURN: {
    de: ["SOLD", "IN_TRANSIT", "RESERVED"],
    para: "AVAILABLE",
    rotulo: "Devolução",
    consomeDisponibilidade: false,
  },
  DEFECT: {
    de: ["AVAILABLE", "RESERVED", "IN_BUILD", "IN_TRANSIT"],
    para: "DEFECTIVE",
    rotulo: "Marcado com defeito",
    consomeDisponibilidade: true,
  },
  DISCARD: {
    de: ["AVAILABLE", "RESERVED", "DEFECTIVE", "IN_TRANSIT"],
    para: "DISCARDED",
    rotulo: "Descarte",
    consomeDisponibilidade: true,
  },
  BUILD_ALLOCATE: {
    de: ["AVAILABLE", "RESERVED"],
    para: "IN_BUILD",
    rotulo: "Uso em montagem",
    consomeDisponibilidade: true,
  },
  BUILD_RELEASE: {
    de: ["IN_BUILD"],
    para: "AVAILABLE",
    rotulo: "Retorno de montagem",
    consomeDisponibilidade: false,
  },
  TRANSFER: {
    // Muda de lugar, não de situação.
    de: ["AVAILABLE", "RESERVED", "IN_BUILD", "DEFECTIVE", "IN_TRANSIT"],
    para: "manter",
    rotulo: "Transferência de local",
    consomeDisponibilidade: false,
  },
  ADJUSTMENT: {
    de: null,
    para: "manter",
    rotulo: "Ajuste manual",
    consomeDisponibilidade: false,
  },
};

export type ResultadoTransicao =
  | { ok: true; novoStatus: UnitStatus }
  | { ok: false; motivo: string };

const ROTULO_STATUS: Record<UnitStatus, string> = {
  AVAILABLE: "disponível",
  RESERVED: "reservada",
  IN_BUILD: "em montagem",
  SOLD: "vendida",
  DEFECTIVE: "com defeito",
  DISCARDED: "descartada",
  IN_TRANSIT: "em trânsito",
};

export function rotuloDoStatus(status: UnitStatus): string {
  return ROTULO_STATUS[status];
}

/**
 * Decide se um movimento pode ser aplicado a uma unidade no status atual.
 *
 * A mensagem de recusa é escrita para o usuário final: ela precisa explicar
 * por que a operação não vale, e não apenas que falhou.
 */
export function validarTransicao(
  tipo: MovementType,
  statusAtual: UnitStatus,
): ResultadoTransicao {
  const regra = REGRAS_DE_MOVIMENTO[tipo];

  if (STATUS_TERMINAIS.includes(statusAtual)) {
    return {
      ok: false,
      motivo: `Esta unidade está ${rotuloDoStatus(statusAtual)} e não aceita novas movimentações.`,
    };
  }

  if (regra.de !== null && !regra.de.includes(statusAtual)) {
    const aceitos = regra.de.map(rotuloDoStatus).join(", ");
    return {
      ok: false,
      motivo: `Não é possível registrar "${regra.rotulo}": a unidade está ${rotuloDoStatus(statusAtual)}. Esta operação só vale para unidade ${aceitos}.`,
    };
  }

  return {
    ok: true,
    novoStatus: regra.para === "manter" ? statusAtual : regra.para,
  };
}

/**
 * Movimentos permitidos para produtos controlados por quantidade.
 *
 * Um cabo SATA não é reservado nem alocado individualmente: não há unidade
 * física distinguível para prender. Suportar reserva parcial de item fungível
 * exigiria dividir a linha de saldo em várias, e a complexidade não se paga no
 * MVP. Em vez de fingir que funciona, o sistema recusa com uma explicação.
 */
export const MOVIMENTOS_POR_QUANTIDADE: readonly MovementType[] = [
  "INBOUND",
  "OUTBOUND",
  "SALE",
  "DEFECT",
  "DISCARD",
  "TRANSFER",
  "ADJUSTMENT",
  "RETURN",
];

export function permitidoParaQuantidade(tipo: MovementType): boolean {
  return MOVIMENTOS_POR_QUANTIDADE.includes(tipo);
}

/** Movimentos que reduzem o saldo de um item controlado por quantidade. */
export const MOVIMENTOS_QUE_REDUZEM_SALDO: readonly MovementType[] = [
  "OUTBOUND",
  "SALE",
  "DEFECT",
  "DISCARD",
];

/** Movimentos que aumentam o saldo de um item controlado por quantidade. */
export const MOVIMENTOS_QUE_AUMENTAM_SALDO: readonly MovementType[] = [
  "INBOUND",
  "RETURN",
];

/**
 * Calcula o novo saldo de um item por quantidade.
 *
 * Saldo negativo nunca é aceito: seria uma mentira sobre o estoque físico.
 */
export function calcularNovoSaldo(
  saldoAtual: number,
  tipo: MovementType,
  quantidade: number,
): { ok: true; novoSaldo: number } | { ok: false; motivo: string } {
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    return { ok: false, motivo: "A quantidade precisa ser um inteiro maior que zero." };
  }

  if (MOVIMENTOS_QUE_AUMENTAM_SALDO.includes(tipo)) {
    return { ok: true, novoSaldo: saldoAtual + quantidade };
  }

  if (MOVIMENTOS_QUE_REDUZEM_SALDO.includes(tipo)) {
    if (quantidade > saldoAtual) {
      return {
        ok: false,
        motivo: `Saldo insuficiente: há ${saldoAtual} em estoque e a operação pede ${quantidade}.`,
      };
    }
    return { ok: true, novoSaldo: saldoAtual - quantidade };
  }

  // ADJUSTMENT e TRANSFER não alteram o saldo por esta via.
  return { ok: true, novoSaldo: saldoAtual };
}
