import "server-only";

import { identificarGargalos } from "@/domain/compatibility/suggester";
import type { Ferramenta } from "@/lib/ai/tool-types";
import { prisma } from "@/server/db/client";

import {
  carregarEstoqueParaMontagem,
  montarPainelDeSugestoes,
} from "./build.service";

/**
 * Implementação das ferramentas de consulta ao estoque.
 *
 * Cada uma responde a uma pergunta que a especificação (seção 7) lista como
 * exemplo. Todas são somente leitura, todas têm limite de linhas, e todas
 * devolvem JSON compacto — o modelo paga por token, e uma linha a mais
 * multiplicada por cinquenta resultados custa contexto que faria falta na
 * resposta.
 */

/** Teto de linhas por consulta. Pergunta vaga não vira varredura de tabela. */
const LIMITE = 40;

function reduzirSpecs(specs: unknown): Record<string, unknown> {
  if (typeof specs !== "object" || specs === null) return {};
  return specs as Record<string, unknown>;
}

const buscarNoEstoque: Ferramenta = {
  definicao: {
    nome: "buscar_no_estoque",
    descricao:
      "Busca peças no estoque por texto livre (nome, modelo, marca, part number, serial ou código interno) e/ou por categoria e situação. Use quando o usuário perguntar o que existe, onde está, ou quiser localizar uma peça específica.",
    parametros: {
      type: "object",
      properties: {
        termo: {
          type: "string",
          description: "Texto a procurar. Opcional.",
        },
        categoria: {
          type: "string",
          description:
            "Slug da categoria: cpu, motherboard, ram, gpu, storage, psu, case, cooler, monitor, peripheral, cable, notebook, desktop, network, fan, misc.",
        },
        situacao: {
          type: "string",
          enum: [
            "AVAILABLE",
            "RESERVED",
            "IN_BUILD",
            "SOLD",
            "DEFECTIVE",
            "DISCARDED",
            "IN_TRANSIT",
          ],
          description: "Situação da unidade. Omitir traz todas.",
        },
      },
    },
  },

  async executar(argumentos) {
    const termo =
      typeof argumentos.termo === "string" ? argumentos.termo.trim() : "";
    const categoria =
      typeof argumentos.categoria === "string" ? argumentos.categoria : undefined;
    const situacao =
      typeof argumentos.situacao === "string" ? argumentos.situacao : undefined;

    const unidades = await prisma.inventoryUnit.findMany({
      where: {
        ...(situacao
          ? { status: situacao as "AVAILABLE" }
          : {}),
        ...(termo
          ? {
              OR: [
                { internalCode: { contains: termo, mode: "insensitive" } },
                { serialNumber: { contains: termo, mode: "insensitive" } },
                {
                  product: {
                    is: {
                      OR: [
                        { name: { contains: termo, mode: "insensitive" } },
                        { model: { contains: termo, mode: "insensitive" } },
                        { partNumber: { contains: termo, mode: "insensitive" } },
                      ],
                    },
                  },
                },
              ],
            }
          : {}),
        ...(categoria
          ? { product: { is: { category: { is: { slug: categoria } } } } }
          : {}),
      },
      take: LIMITE,
      orderBy: { entryDate: "desc" },
      select: {
        id: true,
        internalCode: true,
        serialLast: true,
        status: true,
        condition: true,
        quantity: true,
        estimatedSalePrice: true,
        purchaseCost: true,
        location: { select: { name: true } },
        product: {
          select: {
            name: true,
            specs: true,
            brand: { select: { name: true } },
            category: { select: { slug: true, name: true } },
          },
        },
      },
    });

    return {
      total: unidades.length,
      limitadoEm: LIMITE,
      pecas: unidades.map((unidade) => ({
        codigo: unidade.internalCode,
        nome: unidade.product.name,
        marca: unidade.product.brand?.name ?? null,
        categoria: unidade.product.category.name,
        situacao: unidade.status,
        estado: unidade.condition,
        quantidade: unidade.quantity,
        local: unidade.location?.name ?? null,
        serialFinal: unidade.serialLast,
        custo: Number(unidade.purchaseCost ?? 0) || null,
        valorVenda: Number(unidade.estimatedSalePrice ?? 0) || null,
        specs: reduzirSpecs(unidade.product.specs),
      })),
    };
  },
};

const resumoDoEstoque: Ferramenta = {
  definicao: {
    nome: "resumo_do_estoque",
    descricao:
      "Números gerais do estoque: total de peças, disponíveis, reservadas, com defeito, valor investido e valor estimado de venda, além da quebra por categoria. Use para perguntas como 'quanto vale meu estoque' ou 'o que eu tenho'.",
    parametros: { type: "object", properties: {} },
  },

  async executar() {
    const [porStatus, valores, porCategoria] = await Promise.all([
      prisma.inventoryUnit.groupBy({
        by: ["status"],
        _sum: { quantity: true },
      }),
      prisma.inventoryUnit.aggregate({
        where: { status: { in: ["AVAILABLE", "RESERVED", "IN_BUILD"] } },
        _sum: { estimatedSalePrice: true, purchaseCost: true },
      }),
      prisma.category.findMany({
        select: {
          name: true,
          slug: true,
          products: {
            select: {
              units: {
                where: { status: "AVAILABLE" },
                select: { quantity: true, estimatedSalePrice: true },
              },
            },
          },
        },
      }),
    ]);

    return {
      porSituacao: Object.fromEntries(
        porStatus.map((linha) => [linha.status, linha._sum.quantity ?? 0]),
      ),
      valorInvestido: Number(valores._sum.purchaseCost ?? 0),
      valorEstimadoDeVenda: Number(valores._sum.estimatedSalePrice ?? 0),
      porCategoria: porCategoria
        .map((categoria) => {
          const unidades = categoria.products.flatMap(
            (produto) => produto.units,
          );
          return {
            categoria: categoria.name,
            slug: categoria.slug,
            disponiveis: unidades.reduce((soma, u) => soma + u.quantity, 0),
            valor: unidades.reduce(
              (soma, u) => soma + Number(u.estimatedSalePrice ?? 0) * u.quantity,
              0,
            ),
          };
        })
        .filter((linha) => linha.disponiveis > 0),
    };
  },
};

const montagensPossiveis: Ferramenta = {
  definicao: {
    nome: "montagens_possiveis",
    descricao:
      "Calcula quais computadores podem ser montados agora com as peças disponíveis, usando o motor determinístico de compatibilidade. Devolve os componentes de cada montagem, o veredito de compatibilidade, o consumo estimado e o que falta. Use para 'o que consigo montar', 'qual a melhor máquina que dá para montar' ou 'quais PCs gamer consigo montar'.",
    parametros: {
      type: "object",
      properties: {
        maximo: {
          type: "number",
          description: "Quantas montagens no máximo. Padrão 6.",
        },
      },
    },
  },

  async executar(argumentos) {
    const maximo = Math.min(
      Number(argumentos.maximo) || 6,
      10,
    );
    const painel = await montarPainelDeSugestoes(maximo);

    return {
      montagens: painel.sugestoes.map((sugestao) => ({
        nivel: sugestao.nivel,
        usos: sugestao.usosRecomendados,
        compatibilidade: sugestao.compatibilidade.nivel,
        consumoW: sugestao.compatibilidade.consumoEstimadoW,
        fonteRecomendadaW: sugestao.compatibilidade.fonteRecomendadaW,
        valorDasPecas: sugestao.valorDasPecas,
        faltando: sugestao.compatibilidade.pecasFaltando,
        componentes: {
          processador: sugestao.montagem.cpu?.nome ?? null,
          placaMae: sugestao.montagem.motherboard?.nome ?? null,
          memoria: sugestao.montagem.ram.map((p) => p.nome),
          video: sugestao.montagem.gpu?.nome ?? null,
          armazenamento: sugestao.montagem.storage.map((p) => p.nome),
          fonte: sugestao.montagem.psu?.nome ?? null,
          gabinete: sugestao.montagem.case?.nome ?? null,
          cooler: sugestao.montagem.cooler?.nome ?? null,
        },
        // As ressalvas vêm do motor determinístico, não de julgamento do
        // modelo. Ele deve reproduzi-las, nunca contradizê-las.
        ressalvas: sugestao.compatibilidade.checks
          .filter((check) => check.nivel !== "COMPATIBLE")
          .map((check) => ({ nivel: check.nivel, motivo: check.mensagem })),
      })),
      gargalos: painel.gargalos,
    };
  },
};

const gargalosDoEstoque: Ferramenta = {
  definicao: {
    nome: "gargalos_do_estoque",
    descricao:
      "Aponta quais categorias de peça estão limitando o número de computadores montáveis, e quantas montagens a mais seriam liberadas resolvendo cada uma. Use para 'quais peças estão impedindo montar mais' ou 'o que devo comprar'.",
    parametros: { type: "object", properties: {} },
  },

  async executar() {
    const { estoque } = await carregarEstoqueParaMontagem();

    return {
      disponibilidade: {
        processadores: estoque.cpus.length,
        placasMae: estoque.motherboards.length,
        memorias: estoque.rams.length,
        placasDeVideo: estoque.gpus.length,
        armazenamento: estoque.storages.length,
        fontes: estoque.psus.length,
        gabinetes: estoque.cases.length,
        coolers: estoque.coolers.length,
      },
      gargalos: identificarGargalos(estoque),
    };
  },
};

const pecasParadas: Ferramenta = {
  definicao: {
    nome: "pecas_paradas",
    descricao:
      "Lista peças disponíveis que estão no estoque há mais tempo, com o valor parado em cada uma. Use para 'o que está encalhado', 'onde meu dinheiro está parado' ou 'o que devo vender'.",
    parametros: {
      type: "object",
      properties: {
        diasMinimos: {
          type: "number",
          description: "Só peças paradas há pelo menos N dias. Padrão 60.",
        },
      },
    },
  },

  async executar(argumentos) {
    const dias = Number(argumentos.diasMinimos) || 60;
    const limite = new Date();
    limite.setDate(limite.getDate() - dias);

    const unidades = await prisma.inventoryUnit.findMany({
      where: { status: "AVAILABLE", entryDate: { lte: limite } },
      orderBy: { entryDate: "asc" },
      take: LIMITE,
      select: {
        internalCode: true,
        entryDate: true,
        purchaseCost: true,
        estimatedSalePrice: true,
        product: {
          select: { name: true, category: { select: { name: true } } },
        },
      },
    });

    const agora = Date.now();

    return {
      diasMinimos: dias,
      total: unidades.length,
      pecas: unidades.map((unidade) => ({
        codigo: unidade.internalCode,
        nome: unidade.product.name,
        categoria: unidade.product.category.name,
        diasParada: Math.floor(
          (agora - unidade.entryDate.getTime()) / 86_400_000,
        ),
        custo: Number(unidade.purchaseCost ?? 0) || null,
        valorVenda: Number(unidade.estimatedSalePrice ?? 0) || null,
      })),
    };
  },
};

const extratoDeSocios: Ferramenta = {
  definicao: {
    nome: "extrato_de_socios",
    descricao:
      "Quanto cada sócio investiu em peças, quanto já retornou em vendas e quanto ainda está parado em estoque. Use para perguntas sobre quem gastou quanto.",
    parametros: { type: "object", properties: {} },
  },

  async executar() {
    const { extratoDosSocios } = await import("./partner.service");
    return { socios: await extratoDosSocios() };
  },
};

const historicoDeMovimentacao: Ferramenta = {
  definicao: {
    nome: "historico_de_movimentacao",
    descricao:
      "Últimas movimentações do estoque, opcionalmente filtradas por tipo. Use para 'o que entrou esta semana', 'o que foi vendido' ou para investigar o histórico de uma peça.",
    parametros: {
      type: "object",
      properties: {
        tipo: {
          type: "string",
          enum: [
            "INBOUND",
            "OUTBOUND",
            "SALE",
            "RESERVE",
            "UNRESERVE",
            "RETURN",
            "DEFECT",
            "DISCARD",
            "BUILD_ALLOCATE",
            "BUILD_RELEASE",
            "TRANSFER",
            "ADJUSTMENT",
          ],
        },
        diasAtras: {
          type: "number",
          description: "Período em dias. Padrão 30.",
        },
      },
    },
  },

  async executar(argumentos) {
    const dias = Number(argumentos.diasAtras) || 30;
    const desde = new Date();
    desde.setDate(desde.getDate() - dias);

    const movimentos = await prisma.inventoryMovement.findMany({
      where: {
        createdAt: { gte: desde },
        ...(typeof argumentos.tipo === "string"
          ? { type: argumentos.tipo as "SALE" }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: LIMITE,
      select: {
        type: true,
        quantity: true,
        amount: true,
        reason: true,
        createdAt: true,
        product: { select: { name: true } },
        partner: { select: { name: true } },
      },
    });

    return {
      periodoDias: dias,
      total: movimentos.length,
      movimentos: movimentos.map((movimento) => ({
        tipo: movimento.type,
        peca: movimento.product.name,
        quantidade: movimento.quantity,
        valor: Number(movimento.amount ?? 0) || null,
        socio: movimento.partner?.name ?? null,
        motivo: movimento.reason,
        data: movimento.createdAt.toISOString().slice(0, 10),
      })),
    };
  },
};

const simularCompra: Ferramenta = {
  definicao: {
    nome: "simular_compra",
    descricao:
      "Estima quantas montagens a mais seriam possíveis ao comprar N peças de uma categoria. Use para 'se eu comprar 3 fontes, quantos PCs a mais consigo montar'.",
    parametros: {
      type: "object",
      properties: {
        categoria: {
          type: "string",
          description: "Slug: cpu, motherboard, ram, gpu, storage, psu, case, cooler.",
        },
        quantidade: { type: "number", description: "Quantas peças comprar." },
      },
      required: ["categoria", "quantidade"],
    },
  },

  async executar(argumentos) {
    const categoria = String(argumentos.categoria);
    const quantidade = Math.max(0, Number(argumentos.quantidade) || 0);

    const { estoque } = await carregarEstoqueParaMontagem();

    const contagem: Record<string, number> = {
      cpu: estoque.cpus.length,
      motherboard: estoque.motherboards.length,
      ram: estoque.rams.length,
      gpu: estoque.gpus.length,
      storage: estoque.storages.length,
      psu: estoque.psus.length,
      case: estoque.cases.length,
      cooler: estoque.coolers.length,
    };

    // Papéis essenciais: uma máquina não existe sem eles. GPU e cooler ficam
    // de fora porque há montagem válida sem os dois.
    const essenciais = ["cpu", "motherboard", "ram", "storage", "psu", "case"];
    const antes = Math.min(...essenciais.map((papel) => contagem[papel] ?? 0));

    const depoisContagem = { ...contagem };
    depoisContagem[categoria] = (depoisContagem[categoria] ?? 0) + quantidade;
    const depois = Math.min(
      ...essenciais.map((papel) => depoisContagem[papel] ?? 0),
    );

    return {
      categoria,
      quantidadeSimulada: quantidade,
      montagensAntes: antes,
      montagensDepois: depois,
      ganho: depois - antes,
      // O ganho zero costuma ser a informação mais útil: significa que outro
      // papel continua travando, e comprar esta peça não resolve nada.
      observacao:
        depois === antes
          ? "Comprar esta peça não libera montagem nenhuma: outro item continua sendo o gargalo."
          : null,
      disponibilidadeAtual: contagem,
    };
  },
};

/** Todas as ferramentas disponíveis para o chat. */
export const FERRAMENTAS: readonly Ferramenta[] = [
  buscarNoEstoque,
  resumoDoEstoque,
  montagensPossiveis,
  gargalosDoEstoque,
  pecasParadas,
  extratoDeSocios,
  historicoDeMovimentacao,
  simularCompra,
];

export function ferramentaPorNome(nome: string): Ferramenta | undefined {
  return FERRAMENTAS.find((ferramenta) => ferramenta.definicao.nome === nome);
}
