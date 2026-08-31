import { storage } from "@/lib/storage";
import { requireContext } from "@/server/session";

/**
 * Serve uma imagem do storage.
 *
 * Existe porque o store de blobs e PRIVADO: foto de peca costuma mostrar o
 * numero de serie na etiqueta, e num store publico qualquer pessoa com a URL
 * veria o inventario. Aqui a sessao e verificada antes de entregar o byte.
 *
 * O cache e `private`: proibe CDN e proxy de guardar a resposta, que e o que
 * evitaria a imagem de um usuario chegar a outro.
 */
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ chave: string[] }> },
) {
  await requireContext();

  const { chave } = await params;
  const caminho = chave.join("/");

  const arquivo = await storage().get(caminho);
  if (!arquivo) {
    return new Response("Imagem nao encontrada.", { status: 404 });
  }

  return new Response(new Uint8Array(arquivo.dados), {
    headers: {
      "content-type": arquivo.contentType,
      "content-length": String(arquivo.dados.byteLength),
      // Imutavel: a chave inclui o id do registro, entao o conteudo nunca muda.
      // `private` impede cache compartilhado entre usuarios.
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}
