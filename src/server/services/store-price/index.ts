import "server-only";

import {
  escolherMelhor,
  normalizar,
  tokens,
} from "@/domain/promotions/casar-produto";
import { prisma } from "@/server/db/client";

import { ConsultaFalhouError, baixarPagina } from "./http";
import { extrairProdutos } from "./ld-json";

/**
 * Preço da peça nas lojas de informática.
 *
 * ## Por que isto existe
 *
 * A nota já sabia comparar a oferta com **o que esta operação pagou** naquela
 * peça. Faltava a outra metade da conta: quanto a peça custa hoje em Kabum,
 * Pichau e Terabyte. Sem isso, "R$ 1.290 numa RTX 3060" só podia ser julgado
 * contra o próprio histórico, que envelhece — hardware cai de preço, e um
 * custo de oito meses atrás vira parâmetro ruim.
 *
 * ## O que este módulo não faz
 *
 * Não usa a busca da Pichau nem a da Terabyte: as duas proíbem no
 * `robots.txt`. Usa o sitemap que elas publicam (ver `sitemap.ts`) e depois a
 * página do produto, que é liberada. A Kabum libera `/busca/<termo>` sem
 * query, e é o que se usa lá — uma requisição, dez produtos.
 *
 * Não lê preço de HTML de layout: só do JSON-LD que a loja publica para ser
 * lido por máquina. Quando ele não vier, a consulta falha e diz que falhou.
 *
 * ## A falha é um resultado, não um erro
 *
 * Loja fora do ar, layout mudado, peça que não existe no catálogo: tudo isso
 * devolve "não consultado", com motivo. A avaliação segue sem aquele preço e
 * **diz** que seguiu. Nota calculada sobre preço inventado seria pior que
 * nota sem preço nenhum.
 */

export interface PrecoDeLoja {
  loja: string;
  produto: string;
  url: string;
  preco: number;
  vistoEm: Date;
}

export interface LojaNaoConsultada {
  loja: string;
  motivo: string;
}

export interface ConsultaDePrecos {
  precos: PrecoDeLoja[];
  falhas: LojaNaoConsultada[];
}

const LOJAS = [
  { slug: "kabum", nome: "Kabum", via: "busca" },
  { slug: "pichau", nome: "Pichau", via: "catalogo" },
  { slug: "terabyte", nome: "Terabyte", via: "catalogo" },
] as const;

/**
 * Validade do preço em cache.
 *
 * Preço de loja muda em dias, não em minutos. Meio dia evita repetir a
 * consulta a cada clique em "Avaliar" sem deixar a comparação velha.
 */
const VALIDADE_MS = 12 * 60 * 60 * 1000;

/**
 * Quanto tempo lembrar que uma loja recusou a consulta.
 *
 * Sem isto, cada clique em "Avaliar" bate de novo na porta de quem já disse
 * não — e faz a pessoa esperar o timeout de uma loja que não vai responder.
 * Meia hora é curto o bastante para voltar sozinho quando a loja liberar, e
 * longo o bastante para não virar insistência.
 */
const MEMORIA_DE_RECUSA_MS = 30 * 60 * 1000;

const chaveDeRecusa = (slug: string) => `precos.recusa.${slug}`;

function chave(titulo: string): string {
  return normalizar(titulo).slice(0, 200);
}

async function consultarKabum(titulo: string): Promise<PrecoDeLoja | null> {
  // `/busca/<termo>` sem query: é o que o robots.txt da Kabum libera
  // (`Disallow: /busca/*?` cobre só as URLs com parâmetro).
  //
  // Termo curto de propósito. Jogar o título inteiro na busca ("Ryzen 5 5600
  // AM4 Processador AMD") devolve resultado pior que jogar o que distingue a
  // peça: o modelo. Foi observado — com o título completo a busca trouxe dez
  // produtos e nenhum era o certo.
  const todos = tokens(titulo);
  const comNumero = todos.filter((t) => /\d/.test(t));
  const semNumero = todos.filter((t) => !/\d/.test(t));
  const termo = [...semNumero.slice(0, 2), ...comNumero.slice(0, 2)]
    .slice(0, 4)
    .join("-");

  if (termo === "") return null;

  const html = await baixarPagina(
    `https://www.kabum.com.br/busca/${encodeURIComponent(termo)}`,
  );

  const casamento = escolherMelhor(
    titulo,
    extrairProdutos(html).map((p) => ({
      nome: p.nome,
      url: p.url,
      preco: p.preco,
    })),
  );

  if (!casamento) return null;

  return {
    loja: "Kabum",
    produto: casamento.candidato.nome,
    url: casamento.candidato.url,
    preco: casamento.candidato.preco,
    vistoEm: new Date(),
  };
}

async function consultarCatalogo(
  slug: string,
  nome: string,
  titulo: string,
): Promise<PrecoDeLoja | null> {
  // Tokens com dígito são os que distinguem a peça ("4060", "5600", "1tb").
  // Filtrar por eles no índice reduz milhares de linhas a dezenas.
  const marcantes = tokens(titulo)
    .filter((t) => /\d/.test(t))
    .slice(0, 3);

  const termos = marcantes.length > 0 ? marcantes : tokens(titulo).slice(0, 2);
  if (termos.length === 0) return null;

  const candidatos = await prisma.storeProduct.findMany({
    where: {
      storeSlug: slug,
      AND: termos.map((termo) => ({
        name: { contains: termo, mode: "insensitive" as const },
      })),
    },
    take: 40,
    select: { name: true, url: true },
  });

  if (candidatos.length === 0) {
    // Índice vazio e peça ausente do índice são coisas diferentes, e dizer
    // "não encontrei a peça" quando na verdade não há catálogo indexado
    // mandaria você procurar defeito no lugar errado.
    const tamanho = await prisma.storeProduct.count({ where: { storeSlug: slug } });
    if (tamanho === 0) {
      throw new ConsultaFalhouError(
        "catálogo não indexado (rode: npm run precos:indexar)",
      );
    }
    return null;
  }

  const casamento = escolherMelhor(
    titulo,
    candidatos.map((c) => ({ nome: c.name, url: c.url, preco: 0 })),
  );

  if (!casamento) return null;

  // O índice tem nome e URL, nunca preço: preço se lê na hora, na página do
  // produto, que é o único lugar onde ele é verdade.
  const html = await baixarPagina(casamento.candidato.url);
  const produtos = extrairProdutos(html);
  const produto = produtos[0];

  if (!produto) {
    throw new ConsultaFalhouError("página sem JSON-LD de produto");
  }

  return {
    loja: nome,
    produto: produto.nome,
    url: casamento.candidato.url,
    preco: produto.preco,
    vistoEm: new Date(),
  };
}

async function consultarLoja(
  loja: (typeof LOJAS)[number],
  titulo: string,
): Promise<PrecoDeLoja | null> {
  return loja.via === "busca"
    ? consultarKabum(titulo)
    : consultarCatalogo(loja.slug, loja.nome, titulo);
}

/**
 * Preço da peça em cada loja, com cache curto.
 *
 * As três lojas são consultadas em paralelo — são servidores diferentes, e
 * uma lenta não deve atrasar as outras. Cada uma recebe no máximo uma
 * requisição.
 */
export async function consultarPrecosNasLojas(
  titulo: string,
): Promise<ConsultaDePrecos> {
  const query = chave(titulo);
  if (query === "") return { precos: [], falhas: [] };

  const limite = new Date(Date.now() - VALIDADE_MS);

  const [emCache, recusas] = await Promise.all([
    prisma.storePrice.findMany({ where: { query, fetchedAt: { gte: limite } } }),
    prisma.appSetting.findMany({
      where: { key: { in: LOJAS.map((l) => chaveDeRecusa(l.slug)) } },
    }),
  ]);

  const cacheados = new Map(emCache.map((p) => [p.storeSlug, p]));

  const recusouRecentemente = new Set(
    recusas
      .filter(
        (r) => Date.now() - new Date(r.value).getTime() < MEMORIA_DE_RECUSA_MS,
      )
      .map((r) => r.key),
  );

  const resultados = await Promise.all(
    LOJAS.map(async (loja) => {
      const cache = cacheados.get(loja.slug);
      if (cache) {
        return {
          loja,
          preco: {
            loja: loja.nome,
            produto: cache.productName,
            url: cache.url,
            preco: Number(cache.price),
            vistoEm: cache.fetchedAt,
          } satisfies PrecoDeLoja,
          motivo: null,
        };
      }

      if (recusouRecentemente.has(chaveDeRecusa(loja.slug))) {
        return {
          loja,
          preco: null,
          motivo: "recusou a consulta há pouco; não insisti",
        };
      }

      try {
        const preco = await consultarLoja(loja, titulo);
        return {
          loja,
          preco,
          motivo: preco ? null : "peça não encontrada no catálogo",
        };
      } catch (erro) {
        if (erro instanceof ConsultaFalhouError && erro.recusa) {
          await prisma.appSetting.upsert({
            where: { key: chaveDeRecusa(loja.slug) },
            create: {
              key: chaveDeRecusa(loja.slug),
              value: new Date().toISOString(),
            },
            update: { value: new Date().toISOString() },
          });
        }

        return {
          loja,
          preco: null,
          motivo:
            erro instanceof ConsultaFalhouError
              ? erro.message
              : "falha inesperada na consulta",
        };
      }
    }),
  );

  const precos: PrecoDeLoja[] = [];
  const falhas: LojaNaoConsultada[] = [];

  for (const resultado of resultados) {
    if (resultado.preco) {
      precos.push(resultado.preco);

      if (!cacheados.has(resultado.loja.slug)) {
        await prisma.storePrice.upsert({
          where: {
            storeSlug_query: { storeSlug: resultado.loja.slug, query },
          },
          create: {
            storeSlug: resultado.loja.slug,
            query,
            productName: resultado.preco.produto,
            url: resultado.preco.url,
            price: resultado.preco.preco,
          },
          update: {
            productName: resultado.preco.produto,
            url: resultado.preco.url,
            price: resultado.preco.preco,
            fetchedAt: new Date(),
          },
        });
      }
    } else {
      falhas.push({
        loja: resultado.loja.nome,
        motivo: resultado.motivo ?? "não consultada",
      });
    }
  }

  precos.sort((a, b) => a.preco - b.preco);

  return { precos, falhas };
}
