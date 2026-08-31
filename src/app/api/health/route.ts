/**
 * Checagem de alcancabilidade do servidor, usada pelo indicador de conexao.
 *
 * `navigator.onLine` apenas informa que existe interface de rede ativa; nao
 * garante que o servidor responde. Este endpoint fecha essa lacuna.
 *
 * Publico de proposito: nao revela nada e precisa responder mesmo com a
 * sessao expirada.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(null, { status: 204 });
}

export function HEAD() {
  return new Response(null, { status: 204 });
}
