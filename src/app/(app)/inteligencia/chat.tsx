"use client";

import { Loader2, Send, Sparkles, Wrench } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { cn } from "@/lib/utils";

interface Mensagem {
  papel: "user" | "assistant";
  texto: string;
  ferramentas?: string[];
  erro?: boolean;
}

/**
 * Nome legível de cada ferramenta.
 *
 * Mostrar o que foi consultado não é enfeite: é o que permite ao usuário
 * julgar a resposta. "Consultei as montagens possíveis" e "consultei o
 * histórico" produzem respostas com confiabilidade diferente, e quem lê
 * precisa saber de onde veio.
 */
const NOME_DA_FERRAMENTA: Record<string, string> = {
  buscar_no_estoque: "busca no estoque",
  resumo_do_estoque: "resumo do estoque",
  montagens_possiveis: "montagens possíveis",
  gargalos_do_estoque: "gargalos",
  pecas_paradas: "peças paradas",
  extrato_de_socios: "extrato dos sócios",
  historico_de_movimentacao: "histórico de movimentação",
  simular_compra: "simulação de compra",
};

export function ChatDoEstoque({ sugestoes }: { sugestoes: readonly string[] }) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [pergunta, setPergunta] = useState("");
  const [carregando, setCarregando] = useState(false);
  const { online } = useOnlineStatus();
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensagens, carregando]);

  const enviar = useCallback(
    async (texto: string) => {
      const limpo = texto.trim();
      if (limpo.length < 2 || carregando) return;

      if (!online) {
        setMensagens((atual) => [
          ...atual,
          { papel: "user", texto: limpo },
          {
            papel: "assistant",
            texto:
              "Sem conexão. O assistente consulta o estoque no servidor, então precisa de internet para responder.",
            erro: true,
          },
        ]);
        setPergunta("");
        return;
      }

      const historico = mensagens
        .filter((mensagem) => !mensagem.erro)
        .map((mensagem) => ({ papel: mensagem.papel, texto: mensagem.texto }));

      setMensagens((atual) => [...atual, { papel: "user", texto: limpo }]);
      setPergunta("");
      setCarregando(true);

      try {
        const resposta = await fetch("/api/ia/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pergunta: limpo, historico }),
        });

        const dados: {
          texto?: string;
          ferramentasUsadas?: string[];
          erro?: string;
        } = await resposta.json();

        if (!resposta.ok || !dados.texto) {
          setMensagens((atual) => [
            ...atual,
            {
              papel: "assistant",
              texto: dados.erro ?? "Não consegui responder agora.",
              erro: true,
            },
          ]);
          return;
        }

        setMensagens((atual) => [
          ...atual,
          {
            papel: "assistant",
            texto: dados.texto!,
            ferramentas: dados.ferramentasUsadas ?? [],
          },
        ]);
      } catch {
        setMensagens((atual) => [
          ...atual,
          {
            papel: "assistant",
            texto: "A conexão caiu no meio da consulta. Tente de novo.",
            erro: true,
          },
        ]);
      } finally {
        setCarregando(false);
      }
    },
    [carregando, mensagens, online],
  );

  return (
    <div className="flex min-h-[60dvh] flex-col gap-4">
      {mensagens.length === 0 ? (
        <div className="bg-card rounded-lg border p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="size-4" aria-hidden />
            Pergunte sobre o seu estoque
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            O assistente consulta o banco antes de responder. Ele não estima
            números nem inventa compatibilidade — os vereditos vêm do motor de
            regras.
          </p>

          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {sugestoes.map((sugestao) => (
              <li key={sugestao}>
                <button
                  type="button"
                  onClick={() => void enviar(sugestao)}
                  className="hover:bg-muted w-full rounded-md border p-2.5 text-left text-sm transition-colors"
                >
                  {sugestao}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ol className="flex-1 space-y-3">
          {mensagens.map((mensagem, indice) => (
            <li
              key={indice}
              className={cn(
                "flex",
                mensagem.papel === "user" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                  mensagem.papel === "user"
                    ? "bg-primary text-primary-foreground"
                    : mensagem.erro
                      ? "border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
                      : "bg-card border",
                )}
              >
                <p className="whitespace-pre-wrap">{mensagem.texto}</p>

                {mensagem.ferramentas && mensagem.ferramentas.length > 0 ? (
                  <p className="text-muted-foreground mt-2 flex flex-wrap items-center gap-1 text-xs">
                    <Wrench className="size-3" aria-hidden />
                    consultou:{" "}
                    {mensagem.ferramentas
                      .map((nome) => NOME_DA_FERRAMENTA[nome] ?? nome)
                      .join(", ")}
                  </p>
                ) : null}
              </div>
            </li>
          ))}

          {carregando ? (
            <li className="flex justify-start">
              <div className="bg-card text-muted-foreground flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Consultando o estoque…
              </div>
            </li>
          ) : null}
          <div ref={fimRef} />
        </ol>
      )}

      <form
        className="bg-background sticky bottom-16 flex items-end gap-2 lg:bottom-0"
        onSubmit={(evento) => {
          evento.preventDefault();
          void enviar(pergunta);
        }}
      >
        <Textarea
          value={pergunta}
          onChange={(evento) => setPergunta(evento.target.value)}
          onKeyDown={(evento) => {
            // Enter envia; Shift+Enter quebra linha. No celular o teclado
            // manda newline, então o botão continua sendo o caminho principal.
            if (evento.key === "Enter" && !evento.shiftKey) {
              evento.preventDefault();
              void enviar(pergunta);
            }
          }}
          rows={2}
          placeholder="O que você quer saber sobre o estoque?"
          className="min-h-11 resize-none"
          disabled={carregando}
        />
        <Button
          type="submit"
          size="icon"
          className="size-11 shrink-0"
          disabled={carregando || pergunta.trim().length < 2}
          aria-label="Enviar pergunta"
        >
          <Send className="size-4" aria-hidden />
        </Button>
      </form>
    </div>
  );
}
