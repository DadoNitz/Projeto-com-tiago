import "server-only";

import { GeminiProvider } from "@/lib/ai/gemini-provider";
import { aiProvider } from "@/lib/ai";
import type { ChamadaDeFerramenta } from "@/lib/ai/tool-types";
import { IAIndisponivelError } from "@/lib/ai/types";
import { prisma } from "@/server/db/client";
import type { ActionContext } from "@/server/session";

import { FERRAMENTAS, ferramentaPorNome } from "./ai-tools.service";

/**
 * Chat sobre o estoque (seção 7).
 *
 * O laço é: pergunta → o modelo escolhe ferramentas → o sistema executa as
 * consultas no banco → o modelo formula a resposta com os dados reais.
 *
 * O que a IA **não** faz aqui, e é o ponto do desenho: ela não recebe o banco,
 * não decide compatibilidade e não escreve nada. Compatibilidade vem pronta do
 * motor determinístico; as ferramentas são somente leitura.
 */

/**
 * Teto de idas ao modelo.
 *
 * Sem ele um laço de ferramentas pode não terminar. Três é o suficiente na
 * prática: o modelo consulta, eventualmente refina com uma segunda consulta, e
 * responde. Cada volta é uma chamada de rede que pode levar dezenas de
 * segundos no plano gratuito, e a requisição do usuário tem prazo.
 */
const MAXIMO_DE_VOLTAS = 3;

const INSTRUCAO = [
  "Você é o assistente de um estoque de peças de informática usado para montar",
  "e vender computadores. Responde em português do Brasil, direto ao ponto.",
  "",
  "Como trabalhar:",
  "- SEMPRE consulte as ferramentas antes de responder qualquer coisa sobre o",
  "  estoque. Nunca responda de memória nem estime números.",
  "- Se as ferramentas não trouxerem a informação, diga que não há esse dado",
  "  cadastrado. Não preencha a lacuna com o que é comum no mercado.",
  "- Cite códigos internos (EST-00123) quando falar de uma peça específica:",
  "  é assim que a pessoa acha a peça na prateleira.",
  "- Valores em reais, no formato R$ 1.234,56.",
  "",
  "Sobre compatibilidade — regra inviolável:",
  "- Os vereditos de compatibilidade vêm calculados pela ferramenta",
  "  montagens_possiveis, por regras determinísticas. Reproduza-os como estão.",
  "- NUNCA declare compatível o que veio como 'precisa verificar', e nunca",
  "  suavize um 'incompatível'. Quando vier uma ressalva, repita o motivo.",
  "- Não invente compatibilidade entre peças por conta própria, mesmo que",
  "  pareça óbvia.",
  "",
  "Formato: use frases curtas e listas quando houver mais de dois itens.",
  "Não repita a pergunta antes de responder.",
].join("\n");

export interface MensagemDoChat {
  papel: "user" | "assistant";
  texto: string;
}

export interface RespostaDoChat {
  texto: string;
  /** Ferramentas efetivamente consultadas, para auditoria e transparência. */
  ferramentasUsadas: string[];
  provider: string;
  modelo: string;
}

/**
 * Responde uma pergunta consultando o banco pelas ferramentas.
 *
 * `conversationId` é opcional: quando informado, a conversa e as chamadas de
 * ferramenta ficam gravadas. Guardar as chamadas importa — permite auditar
 * depois se uma recomendação veio de dado real ou de invenção do modelo.
 */
export async function perguntarAoAssistente(
  args: {
    pergunta: string;
    historico?: MensagemDoChat[];
    conversationId?: string | undefined;
  },
  ctx: ActionContext,
): Promise<RespostaDoChat> {
  const provider = aiProvider();

  if (!(provider instanceof GeminiProvider)) {
    throw new IAIndisponivelError(
      provider.nome,
      "este provedor ainda não suporta consulta ao estoque por ferramentas",
    );
  }

  const definicoes = FERRAMENTAS.map((ferramenta) => ferramenta.definicao);
  const ferramentasUsadas: string[] = [];
  const registroDeChamadas: { nome: string; argumentos: unknown; resultado: unknown }[] =
    [];

  // O histórico anterior entra como texto simples. Recarregar as chamadas de
  // ferramenta de turnos passados encheria o contexto sem melhorar a resposta:
  // o que importa daquelas consultas já está na resposta que o modelo deu.
  const contexto = (args.historico ?? [])
    .slice(-6)
    .map((mensagem) => ({
      papel: mensagem.papel,
      texto: mensagem.texto,
    }));

  let historicoBruto: unknown[] | undefined;
  let resposta = await provider.gerar({
    sistema: INSTRUCAO,
    mensagens: [
      ...contexto.map((mensagem) => ({
        papel: mensagem.papel,
        texto: mensagem.texto,
      })),
      { papel: "user" as const, texto: args.pergunta },
    ],
    ferramentas: definicoes,
    temperatura: 0.2,
    maxTokens: 4096,
  });

  for (let volta = 0; volta < MAXIMO_DE_VOLTAS; volta += 1) {
    const chamadas = resposta.chamadas ?? [];
    if (chamadas.length === 0) break;

    const resultados = await Promise.all(
      chamadas.map(async (chamada: ChamadaDeFerramenta) => {
        const ferramenta = ferramentaPorNome(chamada.nome);

        if (!ferramenta) {
          // Modelo pediu ferramenta inexistente: devolve o erro em vez de
          // deixar a conversa travar sem explicação.
          return {
            nome: chamada.nome,
            resultado: { erro: "ferramenta desconhecida" },
          };
        }

        try {
          const resultado = await ferramenta.executar(chamada.argumentos);
          ferramentasUsadas.push(chamada.nome);
          registroDeChamadas.push({
            nome: chamada.nome,
            argumentos: chamada.argumentos,
            resultado,
          });
          return { nome: chamada.nome, resultado };
        } catch (erro) {
          // Falha de uma consulta não derruba a conversa: o modelo recebe o
          // erro e pode responder o que conseguiu apurar.
          console.error(`[ai-tool] ${chamada.nome} falhou:`, erro);
          return {
            nome: chamada.nome,
            resultado: { erro: "a consulta falhou" },
          };
        }
      }),
    );

    historicoBruto = provider.montarRespostaDeFerramentas(
      resposta.historicoBruto ?? [],
      resultados,
    );

    resposta = await provider.gerar({
      sistema: INSTRUCAO,
      mensagens: [],
      historicoBruto,
      ferramentas: definicoes,
      temperatura: 0.2,
      maxTokens: 4096,
    });
  }

  if (resposta.texto.length === 0) {
    throw new IAIndisponivelError(
      provider.nome,
      "o modelo não chegou a uma resposta depois de consultar o estoque",
    );
  }

  if (args.conversationId) {
    await gravarTurno({
      conversationId: args.conversationId,
      pergunta: args.pergunta,
      resposta: resposta.texto,
      chamadas: registroDeChamadas,
      provider: resposta.provider,
      modelo: resposta.modelo,
      tokensEntrada: resposta.tokensEntrada,
      tokensSaida: resposta.tokensSaida,
    });
  }

  void ctx;

  return {
    texto: resposta.texto,
    ferramentasUsadas: [...new Set(ferramentasUsadas)],
    provider: resposta.provider,
    modelo: resposta.modelo,
  };
}

/** Cria uma conversa e devolve o id, para agrupar o histórico. */
export async function iniciarConversa(
  titulo: string,
  ctx: ActionContext,
): Promise<string> {
  const conversa = await prisma.aIConversation.create({
    data: { userId: ctx.userId, title: titulo.slice(0, 120) },
    select: { id: true },
  });
  return conversa.id;
}

async function gravarTurno(args: {
  conversationId: string;
  pergunta: string;
  resposta: string;
  chamadas: unknown[];
  provider: string;
  modelo: string;
  tokensEntrada?: number | undefined;
  tokensSaida?: number | undefined;
}): Promise<void> {
  try {
    await prisma.aIMessage.createMany({
      data: [
        {
          conversationId: args.conversationId,
          role: "user",
          content: args.pergunta,
        },
        {
          conversationId: args.conversationId,
          role: "assistant",
          content: args.resposta,
          // As chamadas ficam gravadas para auditoria: permite verificar
          // depois se a recomendação veio de dado real.
          toolCalls: args.chamadas as object,
          provider: args.provider,
          model: args.modelo,
          tokensIn: args.tokensEntrada ?? null,
          tokensOut: args.tokensSaida ?? null,
        },
      ],
    });
  } catch (erro) {
    // Falha ao gravar histórico não pode derrubar uma resposta já produzida.
    console.error("[ai-chat] falha ao gravar o turno:", erro);
  }
}

/** Perguntas sugeridas na tela vazia, tiradas dos exemplos da seção 7. */
export const PERGUNTAS_SUGERIDAS = [
  "Quais PCs gamer consigo montar hoje?",
  "Qual a melhor máquina que consigo montar sem comprar nada?",
  "Quais peças estão impedindo que eu monte mais computadores?",
  "O que está encalhado no estoque há mais tempo?",
  "Se eu comprar 3 fontes, quantos computadores a mais consigo montar?",
  "Quanto cada sócio já investiu?",
] as const;
