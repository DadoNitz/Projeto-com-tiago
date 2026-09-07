/**
 * Rascunho da montagem em andamento.
 *
 * Montar um PC não acontece numa sentada só: a pessoa vai conferir uma peça na
 * bancada, atende o telefone, procura o preço de outra. Perder a seleção nesse
 * meio tempo obriga a começar de novo, e é o tipo de perda que faz abandonar a
 * ferramenta.
 *
 * A regra que justifica este módulo existir separado da tela é a conferência:
 * **nada é reservado no estoque enquanto a montagem não é salva**. Entre sair e
 * voltar, outra pessoa pode ter vendido a GPU escolhida. Restaurar a seleção
 * crua faria a tela mostrar como escolhida uma peça que não está mais lá — e
 * a montagem sairia diferente do que a pessoa pensava estar montando.
 */

export interface RascunhoRestaurado {
  /** Ids que ainda existem no estoque disponível. */
  validos: string[];
  /** Quantos saíram do disponível enquanto a pessoa estava fora. */
  perdidas: number;
}

/**
 * Confere um rascunho contra o estoque disponível agora.
 *
 * Aceita `unknown` de propósito: o conteúdo vem de `localStorage`, que é texto
 * que qualquer coisa pode ter escrito — versão antiga do sistema, extensão do
 * navegador, edição manual. Confiar no formato aqui seria confiar em dado de
 * fora.
 */
export function conferirRascunho(
  bruto: unknown,
  idsDisponiveis: ReadonlySet<string>,
): RascunhoRestaurado {
  if (!Array.isArray(bruto)) return { validos: [], perdidas: 0 };

  const ids = bruto.filter((id): id is string => typeof id === "string");

  // Duplicata viraria peça contada duas vezes no custo e no motor.
  const unicos = [...new Set(ids)];

  const validos = unicos.filter((id) => idsDisponiveis.has(id));

  return { validos, perdidas: unicos.length - validos.length };
}
