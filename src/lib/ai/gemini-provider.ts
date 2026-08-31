import "server-only";

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
 * moram aqui — ver `src/lib/ai/types.ts`.
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta";

interface ParteGemini {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface RespostaGemini {
  candidates?: {
    content?: { parts?: { text?: string }[] };
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

    const corpo: Record<string, unknown> = {
      contents: [{ role: "user", parts: partes }],
      generationConfig: {
        // Extração e classificação: criatividade aqui é defeito, não virtude.
        temperature: pedido.temperatura ?? 0,
        maxOutputTokens: pedido.maxTokens ?? 2048,
        ...(pedido.schemaDeResposta
          ? {
              responseMimeType: "application/json",
              responseSchema: pedido.schemaDeResposta,
            }
          : {}),
      },
    };

    if (pedido.sistema) {
      corpo.systemInstruction = { parts: [{ text: pedido.sistema }] };
    }

    /*
     * Nova tentativa em sobrecarga (503).
     *
     * Os modelos da camada gratuita respondem "high demand" com frequência, em
     * picos de segundos. Sem retry, a leitura de etiqueta falharia na cara do
     * usuário por um problema que passa sozinho — e ele concluiria que a
     * função não funciona.
     *
     * Só 503 é repetido. 429 é limite de cota: repetir piora.
     */
    let resposta: Response | undefined;
    let dados: RespostaGemini | undefined;
    const TENTATIVAS = 3;

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

    const texto =
      dados.candidates?.[0]?.content?.parts
        ?.map((parte) => parte.text ?? "")
        .join("") ?? "";

    if (texto.length === 0) {
      const motivo = dados.candidates?.[0]?.finishReason ?? "resposta vazia";
      throw new IAIndisponivelError(this.nome, motivo);
    }

    return {
      texto,
      provider: this.nome,
      modelo: this.modelo,
      tokensEntrada: dados.usageMetadata?.promptTokenCount,
      tokensSaida: dados.usageMetadata?.candidatesTokenCount,
    };
  }
}
