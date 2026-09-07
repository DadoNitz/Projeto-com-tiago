/**
 * Remoção de fundo, no navegador.
 *
 * Roda no aparelho de quem tirou a foto, e não no servidor. A escolha não foi
 * estética:
 *
 * - o pacote de servidor (`@imgly/background-removal-node`) ocupa 132 MB
 *   descompactado. Sozinho, ele já estoura o limite de função da Vercel
 *   somado a Next, Prisma e sharp. Não é uma questão de otimizar: não cabe.
 * - a alternativa paga foi descartada por decisão do dono do sistema.
 *
 * Rodando no navegador não há custo por imagem, nem tempo de servidor, e a
 * foto já está ali — ela acabou de sair da câmera.
 *
 * O preço está no primeiro uso: o modelo é baixado uma vez e fica no cache do
 * navegador. Os números vieram do manifesto do próprio pacote:
 *
 *   modelo isnet_quint8    42,3 MB   (escolhido)
 *   modelo isnet_fp16      84,1 MB
 *   modelo isnet          168,0 MB
 *   runtime WASM (cpu)     11,3 MB   (escolhido)
 *   runtime WASM (gpu)     21,9 MB
 *
 * Escolhemos o menor par: ~54 MB. Para foto de peça sobre bancada, a
 * diferença de qualidade entre o quantizado e o completo não paga quatro
 * vezes mais download — ainda mais em celular com dados móveis, que é
 * exatamente onde este sistema é usado.
 */

/** Quanto o primeiro uso baixa, em MB. Usado para avisar antes de começar. */
export const TAMANHO_DO_DOWNLOAD_MB = 54;

export interface ProgressoDaRemocao {
  /** Fração de 0 a 1. */
  fracao: number;
  /** O que está acontecendo, em português. */
  etapa: string;
}

/**
 * Diz se a conexão parece limitada.
 *
 * `saveData` é o usuário pedindo explicitamente para economizar; `2g` e `3g`
 * indicam rede lenta. Nos dois casos, baixar 54 MB sem avisar seria abusivo.
 * A API não existe em todo navegador — quando falta, assumimos que está tudo
 * bem e o aviso genérico do tamanho continua valendo.
 */
export function conexaoParaEconomizar(): boolean {
  const conexao = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;

  if (!conexao) return false;
  if (conexao.saveData) return true;

  return conexao.effectiveType === "2g" || conexao.effectiveType === "slow-2g";
}

/**
 * Se o modelo já está no cache do navegador.
 *
 * Serve para não repetir o aviso de download em toda foto. O Cache Storage do
 * pacote guarda os recursos por URL; basta perguntar se alguma entrada já
 * corresponde ao modelo.
 */
export async function modeloJaBaixado(): Promise<boolean> {
  try {
    if (!("caches" in globalThis)) return false;

    for (const nome of await caches.keys()) {
      const cache = await caches.open(nome);
      const chaves = await cache.keys();
      if (chaves.some((req) => req.url.includes("isnet_quint8"))) return true;
    }
  } catch {
    // Cache indisponível (janela anônima, permissões): tratamos como não
    // baixado, e o usuário vê o aviso. Errar para o lado do aviso é o certo.
  }
  return false;
}

/**
 * Remove o fundo e devolve um PNG com transparência.
 *
 * PNG aqui é o formato de **transporte** até o servidor: sem perda, e o que o
 * modelo já produz. O servidor guarda em WebP, que é bem menor e preserva o
 * canal alfa — isso está coberto por teste em `process.test.ts`, porque um
 * recorte que chegasse achatado contra fundo branco seria pior que não ter
 * recorte, e falharia em silêncio.
 */
export async function removerFundo(
  arquivo: Blob,
  aoProgredir?: (progresso: ProgressoDaRemocao) => void,
): Promise<Blob> {
  // Import dinâmico: o pacote e o runtime ONNX não entram no bundle inicial.
  // Quem nunca usar a remoção de fundo não paga por ela.
  const { removeBackground } = await import("@imgly/background-removal");

  return removeBackground(arquivo, {
    model: "isnet_quint8",
    device: "cpu",
    output: { format: "image/png" },
    progress: (chave, atual, total) => {
      if (!aoProgredir) return;

      const baixandoModelo = chave.includes("model");
      aoProgredir({
        fracao: total > 0 ? atual / total : 0,
        etapa: baixandoModelo
          ? "Baixando o modelo (só na primeira vez)"
          : chave.includes("wasm")
            ? "Preparando o processador de imagem"
            : "Recortando a peça",
      });
    },
  });
}
