import "server-only";

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { del, get as getBlob, put } from "@vercel/blob";

import { env } from "@/lib/env";

import type { ArquivoArmazenado, StorageProvider } from "./types";

/**
 * Drivers de armazenamento.
 *
 * `local` para desenvolvimento (grava fora de `public/`, servido por rota
 * autenticada) e `vercel-blob` para produção — o filesystem da Vercel é
 * somente leitura, então gravar em disco lá simplesmente não funciona.
 */

class LocalStorageProvider implements StorageProvider {
  readonly nome = "local";

  constructor(private readonly diretorio: string) {}

  private caminho(key: string): string {
    // Impede que uma chave manipulada ("../../etc/senha") escape do diretório.
    const limpo = key.replace(/\\/g, "/").replace(/\.\./g, "");
    return path.join(this.diretorio, limpo);
  }

  async put(
    key: string,
    dados: Buffer,
    contentType: string,
  ): Promise<ArquivoArmazenado> {
    const destino = this.caminho(key);
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, dados);
    return { key, sizeBytes: dados.byteLength, contentType };
  }

  async get(key: string) {
    try {
      const dados = await readFile(this.caminho(key));
      return { dados, contentType: contentTypePorExtensao(key) };
    } catch {
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await unlink(this.caminho(key));
    } catch {
      // Arquivo já ausente é o estado desejado.
    }
  }
}

/**
 * Vercel Blob, com store **privado**.
 *
 * Privado de propósito: foto de peça costuma mostrar o número de série na
 * etiqueta. Num store público, qualquer pessoa com a URL — que pode vazar por
 * histórico de navegador, log de proxy ou print — veria o inventário. As
 * imagens são servidas pela rota autenticada `/api/imagens`.
 */
class VercelBlobProvider implements StorageProvider {
  readonly nome = "vercel-blob";

  async put(
    key: string,
    dados: Buffer,
    contentType: string,
  ): Promise<ArquivoArmazenado> {
    const resultado = await put(key, dados, {
      access: "private",
      contentType,
      // A chave já é única (inclui cuid). Sem isto o Blob acrescenta um
      // sufixo aleatório e a chave gravada no banco deixaria de bater.
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    return {
      key: resultado.pathname,
      sizeBytes: dados.byteLength,
      contentType,
    };
  }

  async get(key: string) {
    try {
      const resultado = await getBlob(key, { access: "private" });
      // O SDK devolve null quando o blob não existe, em vez de lançar.
      if (!resultado) return null;

      const dados = Buffer.from(
        await new Response(resultado.stream).arrayBuffer(),
      );

      return {
        dados,
        contentType:
          resultado.headers.get("content-type") ?? contentTypePorExtensao(key),
      };
    } catch {
      // Blob ausente ou token sem acesso: para quem chama, não existe.
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await del(key);
    } catch {
      // Idem: ausente é o estado desejado.
    }
  }
}

function contentTypePorExtensao(key: string): string {
  const extensao = path.extname(key).toLowerCase();
  const mapa: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  };
  return mapa[extensao] ?? "application/octet-stream";
}

let instancia: StorageProvider | null = null;

export function storage(): StorageProvider {
  if (instancia) return instancia;

  const { STORAGE_DRIVER, STORAGE_LOCAL_DIR } = env();

  // Drivers de S3/R2/Supabase entram implementando a mesma interface. O
  // fallback para local é deliberado: melhor gravar em disco em
  // desenvolvimento do que falhar por driver não implementado.
  instancia =
    STORAGE_DRIVER === "local"
      ? new LocalStorageProvider(path.resolve(STORAGE_LOCAL_DIR))
      : new VercelBlobProvider();

  return instancia;
}
