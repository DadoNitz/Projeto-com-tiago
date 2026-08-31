import { estimarConsumo, recomendarFonte, REGRAS } from "./rules";
import {
  piorNivel,
  type MontagemCandidata,
  type ResultadoDeCompatibilidade,
  type ResultadoDeRegra,
} from "./types";

/**
 * Motor de compatibilidade.
 *
 * Aplica todas as regras e consolida um veredito. É a camada determinística
 * que a seção 25 exige **antes** de qualquer participação da IA: aqui se
 * decide o que é compatível; a IA depois apenas explica.
 */

/** Papéis sem os quais não existe um computador que liga. */
const PAPEIS_ESSENCIAIS = [
  { chave: "cpu", rotulo: "Processador" },
  { chave: "motherboard", rotulo: "Placa-mãe" },
  { chave: "ram", rotulo: "Memória RAM" },
  { chave: "storage", rotulo: "Armazenamento" },
  { chave: "psu", rotulo: "Fonte" },
  { chave: "case", rotulo: "Gabinete" },
] as const;

function pecasFaltando(montagem: MontagemCandidata): string[] {
  const faltando: string[] = [];

  for (const papel of PAPEIS_ESSENCIAIS) {
    const valor = montagem[papel.chave];
    const ausente = Array.isArray(valor) ? valor.length === 0 : !valor;
    if (ausente) faltando.push(papel.rotulo);
  }

  return faltando;
}

export function avaliarCompatibilidade(
  montagem: MontagemCandidata,
): ResultadoDeCompatibilidade {
  const checks: ResultadoDeRegra[] = [];

  for (const regra of REGRAS) {
    // Regra que não se aplica devolve null: uma montagem sem placa de vídeo
    // não deve produzir um check de conectores PCIe.
    const resultado = regra(montagem);
    if (resultado) checks.push(resultado);
  }

  const consumoEstimadoW = estimarConsumo(montagem);
  const faltando = pecasFaltando(montagem);

  const niveis = checks.map((check) => check.nivel);

  /*
   * Montagem incompleta nunca é "compatível".
   *
   * Sem fonte, todas as regras de fonte simplesmente não rodam — e o
   * resultado sairia verde por ausência de contradição, e não por acerto.
   * Seria o modo de falha mais enganoso possível: um veredito positivo sobre
   * uma máquina que não existe.
   */
  if (faltando.length > 0) niveis.push("NEEDS_VERIFICATION");

  return {
    nivel: piorNivel(niveis),
    checks,
    consumoEstimadoW,
    fonteRecomendadaW: recomendarFonte(consumoEstimadoW),
    pecasFaltando: faltando,
  };
}

/**
 * Resumo em uma linha, para listagens.
 *
 * Some da tela o detalhe e fica o que decide: o veredito e o motivo principal.
 */
export function resumirCompatibilidade(
  resultado: ResultadoDeCompatibilidade,
): string {
  if (resultado.pecasFaltando.length > 0) {
    return `Faltam: ${resultado.pecasFaltando.join(", ")}.`;
  }

  const problema = resultado.checks.find(
    (check) => check.nivel === "INCOMPATIBLE",
  );
  if (problema) return problema.mensagem;

  const verificar = resultado.checks.find(
    (check) => check.nivel === "NEEDS_VERIFICATION",
  );
  if (verificar) return verificar.mensagem;

  const provavel = resultado.checks.find(
    (check) => check.nivel === "LIKELY_COMPATIBLE",
  );
  if (provavel) return provavel.mensagem;

  return `Configuração compatível. Consumo estimado de ${resultado.consumoEstimadoW} W.`;
}

export { estimarConsumo, recomendarFonte } from "./rules";
export * from "./types";
