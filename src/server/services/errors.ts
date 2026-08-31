/**
 * Erros de regra de negócio.
 *
 * Distinguem-se de falhas técnicas: a mensagem é escrita para o usuário final
 * e chega até ele intacta. Falha técnica vira "algo deu errado" e vai para o
 * log do servidor.
 */
export class RegraDeNegocioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegraDeNegocioError";
  }
}

export class NaoEncontradoError extends RegraDeNegocioError {
  constructor(entidade: string) {
    super(`${entidade} não encontrado(a).`);
    this.name = "NaoEncontradoError";
  }
}

export class ConflitoError extends RegraDeNegocioError {
  constructor(message: string) {
    super(message);
    this.name = "ConflitoError";
  }
}

/**
 * Estado do estoque incompatível com a operação pedida.
 * Ex.: reservar uma peça que já está reservada, ou vender uma já vendida.
 */
export class EstoqueInvalidoError extends RegraDeNegocioError {
  constructor(message: string) {
    super(message);
    this.name = "EstoqueInvalidoError";
  }
}
