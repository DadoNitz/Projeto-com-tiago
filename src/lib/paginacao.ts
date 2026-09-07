/**
 * Endereço de uma página de lista paginada por cursor.
 *
 * Os filtros moram na URL, e alguns aparecem repetidos: a tela de estoque
 * grava `status` e `condition` com `append`, um par por valor marcado. A
 * montagem anterior copiava só os parâmetros de texto (`typeof valor ===
 * "string"`), então marcar duas situações e pedir a próxima página devolvia a
 * lista inteira, sem filtro nenhum. Com uma situação só o valor chegava como
 * texto e passava — por isso o defeito não aparecia no uso mais comum.
 *
 * Passar `cursor` como `null` produz o link do início da lista, que é como se
 * volta de uma página interna sem inventar histórico de cursores.
 */
export function linkDaPagina(
  caminho: string,
  params: Record<string, string | string[] | undefined>,
  cursor?: string | null,
): string {
  const busca = new URLSearchParams();

  for (const [chave, valor] of Object.entries(params)) {
    // O cursor da página atual é justamente o que esta função substitui.
    if (chave === "cursor" || valor === undefined) continue;
    for (const item of [valor].flat()) busca.append(chave, item);
  }

  if (cursor) busca.set("cursor", cursor);

  const consulta = busca.toString();
  return consulta ? `${caminho}?${consulta}` : caminho;
}
