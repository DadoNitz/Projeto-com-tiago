"use client";

import { Camera, Check, Loader2, ScanLine, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { SpecValue } from "@/domain/specs/types";

export interface SugestaoDaEtiqueta {
  categorySlug?: string;
  marca?: string;
  modelo?: string;
  partNumber?: string;
  numeroSerie?: string;
  nomeSugerido?: string;
  specs: Record<string, SpecValue>;
  specsDescartadas: string[];
  textoLido?: string;
  observacoes?: string;
}

/**
 * Captura da etiqueta pela câmera e leitura por IA (seção 14).
 *
 * Usa `<input type="file" capture="environment">` em vez de `getUserMedia`.
 * Parece menos sofisticado, mas é melhor: abre a câmera nativa do aparelho, com
 * autofoco, HDR e flash que o usuário já sabe operar — e são exatamente esses
 * recursos que fazem diferença ao fotografar texto pequeno em etiqueta
 * brilhante. Uma câmera desenhada por nós dentro da página seria pior em todos
 * esses pontos.
 *
 * O `accept` também deixa escolher da galeria: nem toda etiqueta é
 * fotografada na hora.
 *
 * Nada é preenchido sem que a pessoa veja o que foi lido. O resultado aparece
 * para conferência antes de entrar no formulário.
 */
export function LeitorDeEtiqueta({
  categoryId,
  aoAplicar,
}: {
  categoryId: string;
  aoAplicar: (sugestao: SugestaoDaEtiqueta) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [lendo, setLendo] = useState(false);
  const [sugestao, setSugestao] = useState<SugestaoDaEtiqueta | null>(null);

  async function enviar(arquivo: File) {
    setLendo(true);
    setSugestao(null);

    try {
      const corpo = new FormData();
      corpo.append("foto", arquivo);
      if (categoryId) corpo.append("categoryId", categoryId);

      const resposta = await fetch("/api/etiqueta", {
        method: "POST",
        body: corpo,
      });

      const dados: { sugestao?: SugestaoDaEtiqueta; erro?: string } =
        await resposta.json();

      if (!resposta.ok || !dados.sugestao) {
        toast.error("Não deu para ler a etiqueta", {
          description: dados.erro ?? "Tente uma foto mais próxima e sem reflexo.",
        });
        return;
      }

      const nadaLido =
        !dados.sugestao.marca &&
        !dados.sugestao.modelo &&
        !dados.sugestao.numeroSerie &&
        Object.keys(dados.sugestao.specs).length === 0;

      if (nadaLido) {
        toast.warning("Nada legível na foto", {
          description:
            "Aproxime a câmera da etiqueta, evite reflexo e mantenha o texto reto.",
        });
        return;
      }

      setSugestao(dados.sugestao);
    } catch {
      toast.error("Falha ao enviar a foto", {
        description: "Verifique a conexão e tente de novo.",
      });
    } finally {
      setLendo(false);
    }
  }

  const campos = sugestao
    ? [
        ["Marca", sugestao.marca],
        ["Modelo", sugestao.modelo],
        ["Part Number", sugestao.partNumber],
        ["Número de série", sugestao.numeroSerie],
      ].filter((linha): linha is [string, string] => Boolean(linha[1]))
    : [];

  return (
    <div className="bg-muted/40 rounded-lg border border-dashed p-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        // Abre direto a câmera traseira no celular; no desktop, o seletor.
        capture="environment"
        className="sr-only"
        onChange={(evento) => {
          const arquivo = evento.target.files?.[0];
          if (arquivo) void enviar(arquivo);
          // Permite fotografar de novo o mesmo arquivo.
          evento.target.value = "";
        }}
      />

      {!sugestao ? (
        <div className="flex items-start gap-3">
          <ScanLine className="text-muted-foreground mt-0.5 size-5 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Tem etiqueta na peça?</p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Fotografe e o sistema preenche marca, modelo, part number, número
              de série e as especificações. Você confere antes de salvar.
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-2 h-11"
              disabled={lendo}
              onClick={() => inputRef.current?.click()}
            >
              {lendo ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Lendo a etiqueta…
                </>
              ) : (
                <>
                  <Camera className="size-4" aria-hidden />
                  Fotografar etiqueta
                </>
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium">Foi lido na etiqueta</p>
            <button
              type="button"
              onClick={() => setSugestao(null)}
              aria-label="Descartar leitura"
              className="text-muted-foreground hover:text-foreground -m-1 p-1"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <dl className="space-y-1 text-sm">
            {campos.map(([rotulo, valor]) => (
              <div key={rotulo} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{rotulo}</dt>
                <dd className="text-right font-medium">{valor}</dd>
              </div>
            ))}
            {Object.keys(sugestao.specs).length > 0 ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Especificações</dt>
                <dd className="text-right font-medium">
                  {Object.keys(sugestao.specs).length} preenchidas
                </dd>
              </div>
            ) : null}
          </dl>

          {sugestao.specsDescartadas.length > 0 ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Não aproveitado por não bater com o catálogo:{" "}
              {sugestao.specsDescartadas.join(", ")}. Preencha à mão.
            </p>
          ) : null}

          {sugestao.textoLido ? (
            <details className="text-xs">
              <summary className="text-muted-foreground cursor-pointer">
                Ver o texto lido
              </summary>
              <pre className="text-muted-foreground mt-1 whitespace-pre-wrap">
                {sugestao.textoLido}
              </pre>
            </details>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="h-11"
              onClick={() => {
                aoAplicar(sugestao);
                setSugestao(null);
                toast.success("Campos preenchidos", {
                  description: "Confira antes de salvar.",
                });
              }}
            >
              <Check className="size-4" aria-hidden />
              Usar estes dados
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={lendo}
              onClick={() => inputRef.current?.click()}
            >
              <Camera className="size-4" aria-hidden />
              Tirar outra
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
