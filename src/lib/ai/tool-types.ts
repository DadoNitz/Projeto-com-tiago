/**
 * Ferramentas que a IA pode chamar para consultar o estoque (seção 7).
 *
 * O desenho existe para resolver um problema concreto: mandar o banco inteiro
 * no prompt seria caro, lento e estouraria a janela de contexto com alguns
 * milhares de peças. Em vez disso, a IA pede o que precisa e recebe um recorte.
 *
 * Três restrições que valem para toda ferramenta, sem exceção:
 *
 * 1. **Somente leitura.** Nenhuma escreve no banco. A IA não movimenta
 *    estoque, não reserva peça e não cria montagem — se pudesse, um prompt
 *    mal interpretado alteraria o inventário.
 * 2. **Limite rígido de linhas.** Uma pergunta vaga não pode virar uma
 *    varredura da tabela inteira.
 * 3. **Mesma autorização das telas.** A ferramenta roda com o contexto do
 *    usuário; ela não enxerga nada que ele já não pudesse ver.
 */

/** Esquema de parâmetros no formato JSON Schema, entendido pelos provedores. */
export interface DefinicaoDeFerramenta {
  nome: string;
  descricao: string;
  parametros: Record<string, unknown>;
}

export interface ChamadaDeFerramenta {
  nome: string;
  argumentos: Record<string, unknown>;
}

export interface RespostaDeFerramenta {
  nome: string;
  resultado: unknown;
}

/** Uma ferramenta executável: definição mais a função que a atende. */
export interface Ferramenta {
  definicao: DefinicaoDeFerramenta;
  executar(argumentos: Record<string, unknown>): Promise<unknown>;
}
