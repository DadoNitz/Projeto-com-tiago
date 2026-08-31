"use client";

import { Check, Copy, Loader2, Megaphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Anuncio {
  titulo: string;
  descricao: string;
  textoCurto?: string;
}

const CANAIS = [
  { valor: "FACEBOOK_MARKETPLACE", rotulo: "Facebook Marketplace" },
  { valor: "OLX", rotulo: "OLX" },
  { valor: "MERCADO_LIVRE", rotulo: "Mercado Livre" },
  { valor: "WHATSAPP", rotulo: "WhatsApp" },
  { valor: "INSTAGRAM", rotulo: "Instagram" },
] as const;

/**
 * Gera o texto do anúncio a partir dos dados cadastrados.
 *
 * O texto sai como rascunho e é copiado manualmente para a plataforma. O
 * sistema não publica nada sozinho e não guarda credencial de marketplace —
 * publicar em nome de alguém é uma responsabilidade que ele não deve assumir.
 */
export function GerarAnuncio({
  unitId,
  buildId,
  precoSugerido,
}: {
  unitId?: string;
  buildId?: string;
  precoSugerido?: number | undefined;
}) {
  const [aberto, setAberto] = useState(false);
  const [canal, setCanal] = useState<string>("FACEBOOK_MARKETPLACE");
  const [gerando, setGerando] = useState(false);
  const [anuncio, setAnuncio] = useState<Anuncio | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  async function gerar() {
    setGerando(true);
    setAnuncio(null);

    try {
      const resposta = await fetch("/api/ia/anuncio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unitId, buildId, canal, preco: precoSugerido }),
      });

      const dados: { anuncio?: Anuncio; erro?: string } = await resposta.json();

      if (!resposta.ok || !dados.anuncio) {
        toast.error("Não foi possível gerar", {
          description: dados.erro ?? "Tente de novo em instantes.",
        });
        return;
      }

      setAnuncio(dados.anuncio);
    } catch {
      toast.error("Falha na conexão", {
        description: "Verifique a internet e tente de novo.",
      });
    } finally {
      setGerando(false);
    }
  }

  async function copiar(rotulo: string, texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(rotulo);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      toast.error("Não foi possível copiar", {
        description: "Selecione o texto e copie manualmente.",
      });
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="outline" className="h-11" />}>
        <Megaphone className="size-4" aria-hidden />
        Gerar anúncio
      </DialogTrigger>

      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gerar anúncio de venda</DialogTitle>
          <DialogDescription>
            O texto usa só as especificações cadastradas. Confira antes de
            publicar — o sistema não publica nada sozinho.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-4 pb-4">
          <fieldset>
            <Label className="mb-2 block">Canal</Label>
            <div className="flex flex-wrap gap-2">
              {CANAIS.map((opcao) => (
                <button
                  key={opcao.valor}
                  type="button"
                  aria-pressed={canal === opcao.valor}
                  onClick={() => setCanal(opcao.valor)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors",
                    canal === opcao.valor
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:bg-muted",
                  )}
                >
                  {opcao.rotulo}
                </button>
              ))}
            </div>
          </fieldset>

          <Button
            className="h-11 w-full"
            onClick={() => void gerar()}
            disabled={gerando}
          >
            {gerando ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Escrevendo…
              </>
            ) : anuncio ? (
              "Gerar outra versão"
            ) : (
              "Gerar texto"
            )}
          </Button>

          {anuncio ? (
            <div className="space-y-3">
              <BlocoDeTexto
                rotulo="Título"
                texto={anuncio.titulo}
                copiado={copiado === "Título"}
                aoCopiar={copiar}
              />
              <BlocoDeTexto
                rotulo="Descrição"
                texto={anuncio.descricao}
                copiado={copiado === "Descrição"}
                aoCopiar={copiar}
                alto
              />
              {anuncio.textoCurto ? (
                <BlocoDeTexto
                  rotulo="Mensagem curta"
                  texto={anuncio.textoCurto}
                  copiado={copiado === "Mensagem curta"}
                  aoCopiar={copiar}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BlocoDeTexto({
  rotulo,
  texto,
  copiado,
  aoCopiar,
  alto,
}: {
  rotulo: string;
  texto: string;
  copiado: boolean;
  aoCopiar: (rotulo: string, texto: string) => void;
  alto?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <Label>{rotulo}</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => aoCopiar(rotulo, texto)}
        >
          {copiado ? (
            <>
              <Check className="size-3.5" aria-hidden />
              Copiado
            </>
          ) : (
            <>
              <Copy className="size-3.5" aria-hidden />
              Copiar
            </>
          )}
        </Button>
      </div>
      <p
        className={cn(
          "bg-muted/50 rounded-md border p-3 text-sm whitespace-pre-wrap",
          alto && "max-h-72 overflow-y-auto",
        )}
      >
        {texto}
      </p>
    </div>
  );
}
