import { estimarConsumo, recomendarFonte, REGRAS } from "./rules";
import {
  chaveDaVerificacao,
  piorNivel,
  type MontagemCandidata,
  type ResultadoDeCompatibilidade,
  type ResultadoDeRegra,
  type VerificacaoManual,
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

/**
 * Aplica uma verificação manual a um check.
 *
 * Duas travas de segurança:
 *
 * 1. Só regras que declaram `subjectId` são verificáveis, e a busca é exata
 *    por (regra, peça). Procurar em qualquer peça da montagem faria uma
 *    verificação de BIOS registrada num processador satisfazer o aviso da
 *    placa — o recurso viraria um "ignorar aviso" genérico.
 * 2. Uma verificação só resolve `NEEDS_VERIFICATION`. Ela NUNCA transforma
 *    `INCOMPATIBLE` em compatível.
 *
 * A diferença é a razão de existirem dois níveis distintos.
 * `NEEDS_VERIFICATION` significa "o sistema não sabe" — e uma pessoa que
 * olhou a peça sabe mais que o sistema. `INCOMPATIBLE` significa "o sistema
 * sabe que não funciona": socket AM4 não entra em placa LGA1700, e nenhuma
 * conferência humana muda isso. Permitir a exceção aqui transformaria o motor
 * num campo de "ignorar aviso", que é como sistemas de checagem morrem.
 */
function aplicarVerificacao(
  check: ResultadoDeRegra,
  verificacoes: ReadonlyMap<string, VerificacaoManual>,
): ResultadoDeRegra {
  if (check.nivel !== "NEEDS_VERIFICATION") return check;
  if (!check.subjectId) return check;

  const verificacao = verificacoes.get(
    chaveDaVerificacao(check.regra, check.subjectId),
  );
  if (!verificacao) return check;

  return {
    ...check,
    nivel: "COMPATIBLE",
    mensagem: `Verificado manualmente: ${verificacao.reason}`,
    // O campo deixa de faltar: alguém foi olhar.
    camposFaltando: undefined,
  };
}

export function avaliarCompatibilidade(
  montagem: MontagemCandidata,
  verificacoes: ReadonlyMap<string, VerificacaoManual> = new Map(),
): ResultadoDeCompatibilidade {
  const checks: ResultadoDeRegra[] = [];

  for (const regra of REGRAS) {
    // Regra que não se aplica devolve null: uma montagem sem placa de vídeo
    // não deve produzir um check de conectores PCIe.
    const resultado = regra(montagem);
    if (resultado) checks.push(aplicarVerificacao(resultado, verificacoes));
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
