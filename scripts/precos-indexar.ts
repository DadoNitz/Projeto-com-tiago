import path from "node:path";

import { indexarLoja } from "../src/server/services/store-price/sitemap";
import { prisma } from "../prisma/seed/client";

/**
 * Monta o índice de produtos de Pichau e Terabyte a partir do sitemap delas.
 *
 *   npm run precos:indexar
 *
 * ## Por que existe um índice
 *
 * As duas lojas proíbem a busca no `robots.txt`, e liberam a página do
 * produto. Para achar a página certa sem usar a busca proibida, é preciso
 * saber de antemão que páginas existem — e é exatamente isso que o sitemap
 * delas publica.
 *
 * ## Por que é um script, e não parte da consulta
 *
 * São vários MB de XML e dezenas de milhares de URLs por loja. Baixar isso
 * durante um clique em "Avaliar" seria absurdo. Aqui roda quando você manda,
 * de preferência uma vez por semana: catálogo de loja não muda de hora em
 * hora.
 *
 * A Kabum não aparece aqui porque não precisa: ela libera `/busca/<termo>`, e
 * uma requisição já devolve os produtos com preço.
 */

const RAIZ = process.cwd();

for (const arquivo of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(RAIZ, arquivo));
  } catch {
    // arquivo ausente e caso normal
  }
}

const LOJAS = ["terabyte", "pichau"];

/** Insere em blocos: um `createMany` de 30 mil linhas estoura o limite. */
const BLOCO = 1_000;

async function principal(): Promise<number> {
  for (const loja of LOJAS) {
    process.stdout.write(`\n[${loja}] baixando sitemap...\n`);

    let resultado;
    try {
      resultado = await indexarLoja(loja);
    } catch (erro) {
      console.error(
        `[${loja}] falhou: ${erro instanceof Error ? erro.message : erro}`,
      );
      continue;
    }

    const { produtos, falhas } = resultado;

    // Falha de uma parte do catálogo aparece aqui, e não some. Um índice
    // incompleto responde "não achei" com a mesma cara de quem procurou
    // direito — e foi assim que uma primeira versão indexou só periférico.
    for (const falha of falhas) {
      console.error(`[${loja}] ${falha.parte}: ${falha.motivo}`);
    }

    if (produtos.length === 0) {
      console.error(`[${loja}] nenhum produto encontrado — sitemap mudou?`);
      continue;
    }

    // Só troca o índice inteiro quando a coleta veio completa.
    //
    // Apagar antes de inserir custou caro na primeira versão: metade das
    // categorias respondeu 403, o índice foi zerado e a consulta passou a
    // dizer "peça não encontrada" para tudo — com a mesma cara de quem
    // procurou e não achou. Índice velho é pior que índice novo, e muito
    // melhor que índice vazio.
    if (falhas.length === 0) {
      await prisma.storeProduct.deleteMany({ where: { storeSlug: loja } });
    } else {
      console.error(
        `[${loja}] coleta incompleta: mantendo o indice anterior e apenas somando o que veio.`,
      );
    }

    let gravados = 0;
    for (let i = 0; i < produtos.length; i += BLOCO) {
      const bloco = produtos.slice(i, i + BLOCO);
      const { count } = await prisma.storeProduct.createMany({
        data: bloco.map((p) => ({
          storeSlug: p.storeSlug,
          name: p.name,
          url: p.url,
        })),
        skipDuplicates: true,
      });
      gravados += count;
      process.stdout.write(`\r[${loja}] ${gravados} produtos...`);
    }

    process.stdout.write(`\r[${loja}] ${gravados} produtos indexados.\n`);
  }

  await prisma.$disconnect();
  console.log("\nPronto. A avaliacao de promocao ja usa este indice.\n");
  return 0;
}

void principal().then((codigo) => {
  process.exitCode = codigo;
});
