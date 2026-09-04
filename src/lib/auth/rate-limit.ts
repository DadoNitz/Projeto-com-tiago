/**
 * Limite de tentativas de login.
 *
 * Sem isto, o login aceita tentativas ilimitadas: um script testa milhares de
 * senhas por minuto contra um e-mail conhecido, e nada no sistema reage. Com
 * uma equipe pequena, os e-mails são fáceis de adivinhar.
 *
 * O contador vive em memória, e essa escolha tem uma consequência que precisa
 * ser dita: em ambiente serverless, cada instância tem o seu, e reiniciar
 * zera. Isso torna o limite mais frouxo que um contador central em Redis —
 * mas ainda transforma "milhares de tentativas por minuto" em "algumas
 * dezenas", que é a diferença entre força bruta viável e inviável. Introduzir
 * Redis só para isto, numa operação de três pessoas, seria custo maior que o
 * ganho.
 *
 * Se o sistema crescer, este módulo é o único ponto a trocar.
 */

interface Registro {
  tentativas: number;
  /** Quando a janela atual expira. */
  expiraEm: number;
  /** Até quando o e-mail está bloqueado, se estiver. */
  bloqueadoAte?: number;
}

const JANELA_MS = 15 * 60 * 1000;
const MAXIMO_DE_TENTATIVAS = 8;
const BLOQUEIO_MS = 15 * 60 * 1000;

const registros = new Map<string, Registro>();

/** Remove entradas vencidas para o mapa não crescer indefinidamente. */
function limpar(agora: number): void {
  if (registros.size < 500) return;
  for (const [chave, registro] of registros) {
    const vencido = registro.expiraEm < agora && (registro.bloqueadoAte ?? 0) < agora;
    if (vencido) registros.delete(chave);
  }
}

export interface ResultadoDoLimite {
  permitido: boolean;
  /** Segundos até poder tentar de novo, quando bloqueado. */
  esperarSegundos?: number;
}

/**
 * Verifica se um e-mail pode tentar entrar agora.
 *
 * A chave é o e-mail, e não o IP: numa oficina, todo mundo compartilha o mesmo
 * IP, e bloquear por IP deixaria a equipe inteira de fora por causa de uma
 * pessoa que errou a senha.
 */
export function podeTentar(email: string): ResultadoDoLimite {
  const agora = Date.now();
  const chave = email.toLowerCase().trim();
  const registro = registros.get(chave);

  if (!registro) return { permitido: true };

  if (registro.bloqueadoAte && registro.bloqueadoAte > agora) {
    return {
      permitido: false,
      esperarSegundos: Math.ceil((registro.bloqueadoAte - agora) / 1000),
    };
  }

  return { permitido: true };
}

/** Registra uma tentativa falha e bloqueia ao estourar o limite. */
export function registrarFalha(email: string): void {
  const agora = Date.now();
  const chave = email.toLowerCase().trim();
  limpar(agora);

  const registro = registros.get(chave);

  if (!registro || registro.expiraEm < agora) {
    registros.set(chave, { tentativas: 1, expiraEm: agora + JANELA_MS });
    return;
  }

  registro.tentativas += 1;

  if (registro.tentativas >= MAXIMO_DE_TENTATIVAS) {
    registro.bloqueadoAte = agora + BLOQUEIO_MS;
    registro.tentativas = 0;
    registro.expiraEm = agora + JANELA_MS;
  }
}

/** Login bem-sucedido limpa o histórico daquele e-mail. */
export function registrarSucesso(email: string): void {
  registros.delete(email.toLowerCase().trim());
}

/** Usado só nos testes, para isolar um caso do outro. */
export function limparTudo(): void {
  registros.clear();
}
