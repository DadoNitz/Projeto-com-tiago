"use client";

import { Camera, ImagePlus, Loader2, Scissors, TriangleAlert, X } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  conexaoParaEconomizar,
  modeloJaBaixado,
  removerFundo,
  TAMANHO_DO_DOWNLOAD_MB,
  type ProgressoDaRemocao,
} from "@/lib/images/remover-fundo";

/**
 * Fotos tiradas durante o cadastro, antes de a peça existir no banco.
 *
 * ## Por que elas ficam em memória
 *
 * `/api/upload` exige `unitId` ou `productId`, e nenhum dos dois existe
 * enquanto o formulário está aberto. Então as fotos ficam aqui, com prévia
 * local, e só sobem depois que o cadastro é gravado e devolve o id.
 *
 * A ordem importa: subir antes criaria imagem órfã se o cadastro falhasse
 * depois — arquivo pago, ocupando espaço, sem nada apontando para ele.
 *
 * ## O recorte fica ao lado, nunca no lugar
 *
 * Remover o fundo produz uma segunda imagem. A original continua existindo,
 * porque recorte automático erra — peça escura sobre bancada escura — e quem
 * descobre isso depois precisa ter para onde voltar.
 *
 * ## O aviso dos 54 MB
 *
 * O modelo roda no navegador e é baixado na primeira vez. Num celular em
 * dados móveis, começar isso sem perguntar é gastar dinheiro alheio. Depois de
 * baixado o navegador guarda, e o aviso não volta.
 */

export interface FotoPendente {
  id: string;
  arquivo: File;
  previa: string;
  /** Versão sem fundo, quando a pessoa gerou. Sobe ao lado da original. */
  recorte?: Blob | undefined;
  previaRecorte?: string | undefined;
}

/**
 * Sobe as fotos de um cadastro recém-criado.
 *
 * Erro aqui **não** invalida o cadastro: a peça já está gravada, e é melhor
 * ter a peça sem foto do que fazer o operador refazer tudo. Por isso devolve
 * quantas falharam, em vez de lançar.
 */
export async function enviarFotosDoCadastro(
  fotos: FotoPendente[],
  destino: { productId?: string; unitId?: string },
): Promise<{ enviadas: number; falharam: number }> {
  let enviadas = 0;
  let falharam = 0;

  for (const foto of fotos) {
    try {
      const corpo = new FormData();
      corpo.append("foto", foto.arquivo);
      if (destino.unitId) corpo.append("unitId", destino.unitId);
      if (destino.productId) corpo.append("productId", destino.productId);

      const resposta = await fetch("/api/upload", { method: "POST", body: corpo });
      const dados: { id?: string; erro?: string } = await resposta.json();

      if (!resposta.ok || !dados.id) {
        falharam += 1;
        continue;
      }

      enviadas += 1;

      // O recorte é um extra: se ele falhar, a foto original já está salva e
      // o cadastro não perde nada.
      if (foto.recorte) {
        const corpoRecorte = new FormData();
        // Campo "foto" e File de verdade: a rota valida `instanceof File`, e
        // um Blob solto seria recusado com "envie a imagem".
        corpoRecorte.append(
          "foto",
          new File([foto.recorte], "recorte.png", { type: "image/png" }),
        );
        corpoRecorte.append("imageId", dados.id);
        await fetch("/api/upload/recorte", {
          method: "POST",
          body: corpoRecorte,
        }).catch(() => undefined);
      }
    } catch {
      falharam += 1;
    }
  }

  return { enviadas, falharam };
}

export function FotosDoCadastro({
  fotos,
  aoMudar,
}: {
  fotos: FotoPendente[];
  aoMudar: (fotos: FotoPendente[]) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);
  const [recortando, setRecortando] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<ProgressoDaRemocao | null>(null);

  function adicionar(arquivos: FileList) {
    const novas: FotoPendente[] = Array.from(arquivos).map((arquivo) => ({
      id: `${Date.now()}-${arquivo.name}-${Math.random().toString(36).slice(2, 8)}`,
      arquivo,
      previa: URL.createObjectURL(arquivo),
    }));
    aoMudar([...fotos, ...novas]);
  }

  function remover(id: string) {
    const alvo = fotos.find((foto) => foto.id === id);
    // Libera a memória da prévia: sem isto, cadastrar muitas peças seguidas
    // numa mesma sessão vai acumulando blobs que o navegador nunca solta.
    if (alvo) {
      URL.revokeObjectURL(alvo.previa);
      if (alvo.previaRecorte) URL.revokeObjectURL(alvo.previaRecorte);
    }
    aoMudar(fotos.filter((foto) => foto.id !== id));
  }

  async function tirarFundo(foto: FotoPendente) {
    if (!(await modeloJaBaixado())) {
      const emEconomia = conexaoParaEconomizar();
      const aviso = emEconomia
        ? `Sua conexão está marcada como limitada. Remover o fundo baixa cerca de ${TAMANHO_DO_DOWNLOAD_MB} MB agora. Continuar?`
        : `Na primeira vez são baixados cerca de ${TAMANHO_DO_DOWNLOAD_MB} MB. Depois disso fica salvo no navegador. Continuar?`;

      if (!window.confirm(aviso)) return;
    }

    setRecortando(foto.id);
    setProgresso(null);

    try {
      const semFundo = await removerFundo(foto.arquivo, setProgresso);

      aoMudar(
        fotos.map((item) =>
          item.id === foto.id
            ? {
                ...item,
                recorte: semFundo,
                previaRecorte: URL.createObjectURL(semFundo),
              }
            : item,
        ),
      );
    } catch (erro) {
      toast.error("Não foi possível remover o fundo", {
        description:
          erro instanceof Error ? erro.message : "A foto original continua aqui.",
      });
    } finally {
      setRecortando(null);
      setProgresso(null);
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="sr-only"
        onChange={(evento) => {
          if (evento.target.files?.length) adicionar(evento.target.files);
          evento.target.value = "";
        }}
      />
      <input
        ref={galeriaRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(evento) => {
          if (evento.target.files?.length) adicionar(evento.target.files);
          evento.target.value = "";
        }}
      />

      <div className="flex flex-wrap gap-2">
        {/*
          Dois botões, como na tela da peça: "Câmera" abre direto a traseira do
          celular, que é o caso da bancada; "Galeria" passa pelo seletor.
        */}
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={() => cameraRef.current?.click()}
        >
          <Camera className="size-4" aria-hidden />
          Tirar foto da peça
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={() => galeriaRef.current?.click()}
        >
          <ImagePlus className="size-4" aria-hidden />
          Escolher da galeria
        </Button>
      </div>

      {fotos.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Opcional. As fotos ficam no modelo da peça e valem para todas as
          unidades deste cadastro — a foto de uma unidade específica pode ser
          adicionada depois, na página dela.
        </p>
      ) : null}

      {fotos.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {fotos.map((foto) => (
            <li key={foto.id} className="space-y-1.5">
              <div className="bg-muted relative aspect-square overflow-hidden rounded-lg border">
                <Image
                  src={foto.previaRecorte ?? foto.previa}
                  alt=""
                  fill
                  unoptimized
                  className="object-contain"
                />
                <button
                  type="button"
                  onClick={() => remover(foto.id)}
                  aria-label="Remover esta foto"
                  className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </div>

              {foto.recorte ? (
                <p className="text-muted-foreground text-xs">
                  Sem fundo · a original também é salva
                </p>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 w-full text-xs"
                  disabled={recortando !== null}
                  onClick={() => void tirarFundo(foto)}
                >
                  {recortando === foto.id ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Scissors className="size-3.5" aria-hidden />
                  )}
                  {recortando === foto.id ? "Recortando…" : "Remover fundo"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {recortando && progresso ? (
        <div className="rounded-lg border p-3">
          <p className="text-sm">{progresso.etapa}</p>
          <div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full transition-all"
              style={{ width: `${Math.round(progresso.fracao * 100)}%` }}
            />
          </div>
        </div>
      ) : null}

      {fotos.length > 0 ? (
        <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
          <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
          As fotos sobem depois que a peça for gravada. Se alguma falhar, o
          cadastro continua válido e ela pode ser adicionada na página da peça.
        </p>
      ) : null}
    </div>
  );
}
