/**
 * Contrato da camada de IA.
 *
 * A regra que sustenta o desenho (seções 18 e 25): o provedor implementa
 * apenas **transporte** — mandar mensagens, receber texto, traduzir formato de
 * tool call. Prompts, regras de negócio e validação vivem fora dele.
 *
 * Sem essa separação, trocar de modelo significaria reescrever a lógica junto,
 * e é exatamente o acoplamento que a especificação manda evitar.
 */

export interface MensagemDeTexto {
  papel: "user" | "assistant" | "system";
  texto: string;
}

/** Imagem enviada ao modelo, já em memória. */
export interface ImagemParaIA {
  dados: Buffer;
  mimeType: string;
}

export interface PedidoDeGeracao {
  /** Instrução de sistema. Define o comportamento, nunca os dados. */
  sistema?: string;
  mensagens: MensagemDeTexto[];
  imagens?: ImagemParaIA[];
  /**
   * Schema JSON do formato de saída esperado.
   *
   * Quando presente, o provedor exige que a resposta seja um JSON válido nesse
   * formato. É o que transforma "a IA respondeu um texto que parece uma
   * ficha técnica" em dado que o sistema consegue usar sem adivinhar.
   */
  schemaDeResposta?: Record<string, unknown>;
  /**
   * Baixa temperatura por padrão: as tarefas aqui são de extração e
   * classificação, onde criatividade é defeito.
   */
  temperatura?: number;
  maxTokens?: number;
}

export interface RespostaDaIA {
  texto: string;
  provider: string;
  modelo: string;
  tokensEntrada?: number | undefined;
  tokensSaida?: number | undefined;
}

export interface AIProvider {
  readonly nome: string;
  readonly modelo: string;
  gerar(pedido: PedidoDeGeracao): Promise<RespostaDaIA>;
}

/** Falha na comunicação com o provedor. Mensagem legível para o usuário. */
export class IAIndisponivelError extends Error {
  constructor(provedor: string, detalhe: string) {
    super(
      `O serviço de IA (${provedor}) não respondeu: ${detalhe}. ` +
        "Tente de novo em instantes, ou preencha os campos manualmente.",
    );
    this.name = "IAIndisponivelError";
  }
}

/** A IA respondeu, mas fora do formato pedido. */
export class RespostaInvalidaError extends Error {
  constructor(detalhe: string) {
    super(`A IA respondeu em formato inesperado: ${detalhe}`);
    this.name = "RespostaInvalidaError";
  }
}
