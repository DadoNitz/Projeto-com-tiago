import "server-only";

import type { ChamadaDeFerramenta } from "./tool-types";
import {
  IAIndisponivelError,
  type AIProvider,
  type PedidoDeGeracao,
  type RespostaDaIA,
} from "./types";

/**
 * Provedor Google Gemini.
 *
 * Escrito direto sobre a API REST, sem SDK, de propósito: o contrato é
 * pequeno (uma chamada, um formato de resposta) e um SDK traria dependência,
 * ciclo de atualização e superfície muito maiores do que o ganho.
 *
 * Este arquivo só faz transporte. Nenhum prompt e nenhuma regra de negócio
 * moram aqui, e ele nunca executa uma ferramenta — apenas informa quais o
 * modelo pediu. Quem executa é a camada de serviço, que tem acesso ao banco.
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta";

interface ParteGemini {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

interface ConteudoGemini {
  role: "user" | "model";
  parts: ParteGemini[];
}

interface RespostaGemini {
  candidates?: {
    content?: { parts?: ParteGemini[] };
    finishReason?: string;
  }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
  error?: { message?: string; status?: string };
}

export class GeminiProvider implements AIProvider {
  readonly nome = "gemini";

  constructor(
    private readonly apiKey: string,
    readonly modelo: string,
  ) {}

  async gerar(pedido: PedidoDeGeracao): Promise<RespostaDaIA> {
    const contents: ConteudoGemini[] = Array.isArray(pedido.historicoBruto)
      ? (pedido.historicoBruto as ConteudoGemini[])
      : [];

    // Só monta um turno novo quando há mensagem ou imagem. No loop de
    // ferramentas o histórico já traz tudo, e acrescentar um turno vazio faria
    // a API recusar a requisição.
    const partes: ParteGemini[] = [];
    for (const mensagem of pedido.mensagens) {
      if (mensagem.papel === "system") continue;
      partes.push({ text: mensagem.texto });
    }
    for (const imagem of pedido.imagens ?? []) {
      partes.push({
        inlineData: {
          mimeType: imagem.mimeType,
          data: imagem.dados.toString("base64"),
        },
      });
    }
    if (partes.length > 0) contents.push({ role: "user", parts: partes });

    const corpo: Record<string, unknown> = {
      contents,
      generationConfig: {
        // Extração e classificação: criatividade aqui é defeito, não virtude.
        temperature: pedido.temperatura ?? 0,
        maxOutputTokens: pedido.maxTokens ?? 2048,
        // Saída estruturada e ferramentas não convivem: quando o modelo pode
        // chamar função, a resposta precisa poder ser uma chamada.
        ...(pedido.schemaDeResposta && !pedido.ferramentas
          ? {
              responseMimeType: "application/json",
              responseSchema: pedido.schemaDeResposta,
            }
          : {}),
      },
      ...(pedido.ferramentas && pedido.ferramentas.length > 0
        ? {
            tools: [
              {
                functionDeclarations: pedido.ferramentas.map((ferramenta) => ({
                  name: ferramenta.nome,
                  description: ferramenta.descricao,
                  parameters: ferramenta.parametros,
                })),
              },
            ],
          }
        : {}),
    };

    if (pedido.sistema) {
      corpo.systemInstruction = { parts: [{ text: pedido.sistema }] };
    }

    const { resposta, dados } = await this.enviar(corpo);

    if (!resposta.ok) {
      const detalhe = dados.error?.message ?? `HTTP ${resposta.status}`;
      // 429 na camada gratuita é comum e merece mensagem própria: o usuário
      // precisa saber que é limite de uso, não defeito do sistema.
      if (resposta.status === 429) {
        throw new IAIndisponivelError(
          this.nome,
          "limite de requisições do plano gratuito atingido. Aguarde um minuto",
        );
      }
      if (resposta.status === 503) {
        throw new IAIndisponivelError(
          this.nome,
          "o modelo está sobrecarregado no momento. Tente de novo em instantes",
        );
      }
      throw new IAIndisponivelError(this.nome, detalhe);
    }

    const partesResposta = dados.candidates?.[0]?.content?.parts ?? [];

    const texto = partesResposta
      .map((parte) => parte.text ?? "")
      .join("")
      .trim();

    const chamadas: ChamadaDeFerramenta[] = partesResposta
      .filter((parte) => parte.functionCall)
      .map((parte) => ({
        nome: parte.functionCall!.name,
        argumentos: parte.functionCall!.args ?? {},
      }));

    if (texto.length === 0 && chamadas.length === 0) {
      const motivo = dados.candidates?.[0]?.finishReason ?? "resposta vazia";
      throw new IAIndisponivelError(this.nome, motivo);
    }

    // O turno do modelo entra no histórico para que a próxima volta do loop
    // veja a própria chamada de ferramenta que ele fez.
    const historico: ConteudoGemini[] = [
      ...contents,
      { role: "model", parts: partesResposta },
    ];

    return {
      texto,
      chamadas,
      historicoBruto: historico,
      provider: this.nome,
      modelo: this.modelo,
      tokensEntrada: dados.usageMetadata?.promptTokenCount,
      tokensSaida: dados.usageMetadata?.candidatesTokenCount,
    };
  }

  /**
   * Monta o turno com os resultados das ferramentas.
   *
   * Fica no provedor porque o formato é dele: a camada de serviço trabalha com
   * `{ nome, resultado }` e não precisa saber o que é um `functionResponse`.
   */
  montarRespostaDeFerramentas(
    historicoBruto: unknown[],
    resultados: { nome: string; resultado: unknown }[],
  ): unknown[] {
    const historico = historicoBruto as ConteudoGemini[];

    return [
      ...historico,
      {
        role: "user",
        parts: resultados.map((item) => ({
          functionResponse: {
            name: item.nome,
            // A API exige um objeto; um array cru seria recusado.
            response: { resultado: item.resultado },
          },
        })),
      } satisfies ConteudoGemini,
    ];
  }

  /**
   * Envia com nova tentativa em sobrecarga (503).
   *
   * Os modelos da camada gratuita respondem "high demand" com frequência, em
   * picos de segundos. Sem retry, a operação falharia na cara do usuário por
   * um problema que passa sozinho. Só 503 é repetido: 429 é limite de cota, e
   * repetir piora.
   */
  private async enviar(
    corpo: Record<string, unknown>,
  ): Promise<{ resposta: Response; dados: RespostaGemini }> {
    const TENTATIVAS = 3;
    let resposta: Response | undefined;
    let dados: RespostaGemini | undefined;

    for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa += 1) {
      try {
        resposta = await fetch(
          `${BASE}/models/${encodeURIComponent(this.modelo)}:generateContent`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-goog-api-key": this.apiKey,
            },
            body: JSON.stringify(corpo),
            // A camada gratuita pode demorar; mas nada justifica prender uma
            // requisição do usuário indefinidamente.
            signal: AbortSignal.timeout(60_000),
          },
        );
      } catch (erro) {
        throw new IAIndisponivelError(
          this.nome,
          erro instanceof Error ? erro.message : "falha de rede",
        );
      }

      dados = (await resposta.json()) as RespostaGemini;

      if (resposta.status !== 503 || tentativa === TENTATIVAS) break;
      await new Promise((resolve) => setTimeout(resolve, 800 * tentativa));
    }

    if (!resposta || !dados) {
      throw new IAIndisponivelError(this.nome, "sem resposta do serviço");
    }

    return { resposta, dados };
  }
}
