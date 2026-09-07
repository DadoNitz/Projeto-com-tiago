"use client";

import { Check, Loader2, Scissors, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  conexaoParaEconomizar,
  modeloJaBaixado,
  removerFundo,
  TAMANHO_DO_DOWNLOAD_MB,
} from "@/lib/images/remover-fundo";

/**
 * Remove o fundo de uma foto já enviada.
 *
 * Três coisas que o desenho leva a sério:
 *
 * 1. **Avisa antes de baixar.** São ~54 MB na primeira vez. Num celular em
 *    dados móveis, começar isso sem perguntar é gastar o dinheiro de outra
 *    pessoa. Depois de baixado, o navegador guarda e o aviso não volta.
 * 2. **Mostra o resultado antes de gravar.** Recorte automático erra em peça
 *    escura sobre bancada escura, e é o operador que sabe se ficou bom.
 * 3. **Guarda ao lado da original.** A foto original continua lá; o recorte é
 *    uma versão a mais, nunca uma substituição.
 */
export function RemoverFundoDaFoto({
  imageId,
  urlOriginal,
  aoConcluir,
}: {
  imageId: string;
  urlOriginal: string;
  aoConcluir?: (urlRecorte: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [estado, setEstado] = useState<
    "aviso" | "processando" | "conferindo" | "salvando"
  >("aviso");
  const [progresso, setProgresso] = useState({ fracao: 0, etapa: "" });
  const [recorte, setRecorte] = useState<{ blob: Blob; url: string } | null>(
    null,
  );
  const [precisaAvisar, setPrecisaAvisar] = useState(true);
  const [conexaoLimitada, setConexaoLimitada] = useState(false);

  async function abrir() {
    const jaTem = await modeloJaBaixado();
    setPrecisaAvisar(!jaTem);
    setConexaoLimitada(!jaTem && conexaoParaEconomizar());
    setEstado(jaTem ? "processando" : "aviso");
    setAberto(true);

    // Modelo já em cache: começa direto, sem perguntar o óbvio.
    if (jaTem) void processar();
  }

  async function processar() {
    setEstado("processando");
    setProgresso({ fracao: 0, etapa: "Preparando" });

    try {
      const original = await fetch(urlOriginal).then((r) => r.blob());
      const semFundo = await removerFundo(original, setProgresso);

      setRecorte({ blob: semFundo, url: URL.createObjectURL(semFundo) });
      setEstado("conferindo");
    } catch (erro) {
      toast.error("Não foi possível remover o fundo", {
        description:
          erro instanceof Error
            ? erro.message
            : "Tente de novo, ou use a foto original.",
      });
      setAberto(false);
      setEstado("aviso");
    }
  }

  async function salvar() {
    if (!recorte) return;
    setEstado("salvando");

    try {
      const corpo = new FormData();
      corpo.append("foto", recorte.blob, "recorte.png");
      corpo.append("imageId", imageId);

      const resposta = await fetch("/api/upload/recorte", {
        method: "POST",
        body: corpo,
      });
      const dados: { url?: string; erro?: string } = await resposta.json();

      if (!resposta.ok || !dados.url) {
        toast.error("Não foi possível salvar", { description: dados.erro });
        setEstado("conferindo");
        return;
      }

      toast.success("Recorte salvo", {
        description: "A foto original continua guardada.",
      });
      aoConcluir?.(dados.url);
      fechar();
    } catch {
      toast.error("Falha ao salvar o recorte");
      setEstado("conferindo");
    }
  }

  function fechar() {
    if (recorte) URL.revokeObjectURL(recorte.url);
    setRecorte(null);
    setEstado("aviso");
    setAberto(false);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9"
        onClick={() => void abrir()}
      >
        <Scissors className="size-3.5" aria-hidden />
        Remover fundo
      </Button>

      <Dialog open={aberto} onOpenChange={(v) => (v ? setAberto(true) : fechar())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Remover o fundo</DialogTitle>
            <DialogDescription>
              O recorte é salvo ao lado da foto original, nunca no lugar dela.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-4 pb-4">
            {estado === "aviso" && precisaAvisar ? (
              <>
                <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
                  <p className="flex items-start gap-2 font-medium text-amber-900 dark:text-amber-200">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                    Primeira vez: baixa cerca de {TAMANHO_DO_DOWNLOAD_MB} MB
                  </p>
                  <p className="text-amber-900/90 dark:text-amber-200/90">
                    O recorte acontece no próprio aparelho, sem custo por foto.
                    Para isso ele precisa baixar o modelo uma vez — depois fica
                    guardado e as próximas são imediatas.
                  </p>
                  {conexaoLimitada ? (
                    <p className="font-medium text-amber-900 dark:text-amber-200">
                      Sua conexão parece limitada ou em modo de economia. Se
                      puder, faça isso no Wi-Fi.
                    </p>
                  ) : null}
                </div>

                <div className="flex gap-2">
                  <Button className="h-11 flex-1" onClick={() => void processar()}>
                    Baixar e recortar
                  </Button>
                  <Button variant="outline" className="h-11" onClick={fechar}>
                    Agora não
                  </Button>
                </div>
              </>
            ) : null}

            {estado === "processando" ? (
              <div className="space-y-3 py-4">
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {progresso.etapa || "Processando"}
                </div>
                <div
                  className="bg-muted h-2 overflow-hidden rounded-full"
                  role="progressbar"
                  aria-valuenow={Math.round(progresso.fracao * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="bg-primary h-full transition-[width]"
                    style={{ width: `${Math.round(progresso.fracao * 100)}%` }}
                  />
                </div>
                <p className="text-muted-foreground text-xs">
                  Pode deixar a tela aberta. Fechar cancela o recorte.
                </p>
              </div>
            ) : null}

            {estado === "conferindo" || estado === "salvando" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <figure className="space-y-1">
                    <figcaption className="text-muted-foreground text-xs">
                      Original
                    </figcaption>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={urlOriginal}
                      alt="Foto original da peça"
                      className="w-full rounded-lg border object-contain"
                    />
                  </figure>
                  <figure className="space-y-1">
                    <figcaption className="text-muted-foreground text-xs">
                      Sem fundo
                    </figcaption>
                    {/* O xadrez deixa a transparência visível — sobre fundo
                        branco não daria para julgar o recorte. */}
                    <div className="rounded-lg border bg-[repeating-conic-gradient(#e5e5e5_0_25%,transparent_0_50%)] bg-[length:16px_16px]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={recorte?.url}
                        alt="Peça com o fundo removido"
                        className="w-full object-contain"
                      />
                    </div>
                  </figure>
                </div>

                <p className="text-muted-foreground text-xs">
                  Ficou bom? Recorte automático costuma errar em peça escura
                  sobre bancada escura.
                </p>

                <div className="flex gap-2">
                  <Button
                    className="h-11 flex-1"
                    onClick={() => void salvar()}
                    disabled={estado === "salvando"}
                  >
                    {estado === "salvando" ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Check className="size-4" aria-hidden />
                    )}
                    Salvar recorte
                  </Button>
                  <Button
                    variant="outline"
                    className="h-11"
                    onClick={() => void processar()}
                    disabled={estado === "salvando"}
                  >
                    Tentar de novo
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
