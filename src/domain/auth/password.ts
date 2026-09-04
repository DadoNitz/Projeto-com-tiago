/**
 * Política de senha.
 *
 * Módulo de domínio, sem `server-only`: a mesma regra precisa valer na
 * aplicação e nos scripts de linha de comando — inclusive o de recuperação,
 * que roda fora do Next quando não há administrador para entrar pela tela.
 */

/** Custo do bcrypt. 12 é o equilíbrio atual entre segurança e latência. */
export const CUSTO_HASH = 12;

export const TAMANHO_MINIMO = 10;

/**
 * Valida a senha.
 *
 * Comprimento acima de tudo: uma senha longa resiste muito mais a força bruta
 * que uma curta cheia de símbolos, e é mais fácil de lembrar — regras de
 * "um número e um símbolo" empurram para `Senha@1`, que é pior.
 */
export function validarSenha(senha: string): string | null {
  if (senha.length < TAMANHO_MINIMO) {
    return `A senha precisa de pelo menos ${TAMANHO_MINIMO} caracteres.`;
  }

  /*
   * Palavras óbvias só condenam a senha quando ela é *feita* delas.
   *
   * Barrar toda senha que contenha "senha" rejeitaria
   * `cavalo senha grampo bateria` — uma frase de 27 caracteres, forte, do tipo
   * que se quer incentivar. A checagem certa é o que sobra depois de remover
   * as partes previsíveis: "senha123456" vira nada; a frase acima continua
   * com material de sobra.
   */
  const comuns = [
    "senha", "password", "123456", "admin", "qwerty", "estoque", "hardware",
  ];

  const normalizada = senha.toLowerCase();
  const contemPalavraObvia = comuns.some((comum) => normalizada.includes(comum));

  /*
   * A checagem do que "sobra" só se aplica quando há uma palavra óbvia.
   *
   * Aplicá-la sempre reprovava `Nitz351642` — dez caracteres, nada
   * previsível — porque descartar todos os dígitos deixava quatro letras. A
   * pergunta certa não é "quantas letras sobram", e sim "esta senha é FEITA de
   * partes conhecidas". Sem palavra óbvia, o comprimento já decidiu.
   */
  if (!contemPalavraObvia) return null;

  let restante = normalizada;
  for (const comum of comuns) restante = restante.split(comum).join("");
  restante = restante.replace(/[\d\s]/g, "");

  if (restante.length < 6) {
    return "Essa senha é fácil de adivinhar. Use uma frase que só você saiba.";
  }

  return null;
}

