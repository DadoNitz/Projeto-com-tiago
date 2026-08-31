"use client";

import { Camera, Loader2, ScanLine, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Leitura de QR Code pela câmera, com digitação como alternativa.
 *
 * Usa a `BarcodeDetector`, API nativa do navegador — sem biblioteca de
 * decodificação no bundle. Ela ainda não existe em todos os navegadores
 * (notadamente no Safari), então a digitação não é um fallback envergonhado:
 * é um caminho de primeira classe, sempre visível. Numa oficina, digitar seis
 * caracteres costuma ser mais rápido que enquadrar um QR arranhado.
 */

/** A API é experimental e não está no lib.dom; declarada aqui em vez de `any`. */
interface CodigoDetectado {
  rawValue: string;
}
interface DetectorDeCodigo {
  detect(fonte: CanvasImageSource): Promise<CodigoDetectado[]>;
}
type ConstrutorDeDetector = new (opcoes: {
  formats: string[];
}) => DetectorDeCodigo;

function detectorDisponivel(): ConstrutorDeDetector | null {
  const global = window as unknown as {
    BarcodeDetector?: ConstrutorDeDetector;
  };
  return global.BarcodeDetector ?? null;
}

export function LeitorDeCodigo() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [digitado, setDigitado] = useState("");
  /*
   * Suporte a leitura de codigo e uma capacidade do navegador, nao um estado
   * que muda: modelada como store externo em vez de estado sincronizado por
   * efeito. O snapshot do servidor e `false` para que a renderizacao inicial
   * bata com o HTML e nao haja divergencia de hidratacao.
   */
  const suportado = useSyncExternalStore(
    () => () => {},
    () => detectorDisponivel() !== null,
    () => false,
  );

  const parar = useCallback(() => {
    streamRef.current?.getTracks().forEach((trilha) => trilha.stop());
    streamRef.current = null;
    setLendo(false);
  }, []);

  // Desligar a câmera ao sair da tela não é detalhe: câmera ligada em segundo
  // plano consome bateria e acende o LED, o que assusta com razão.
  useEffect(() => parar, [parar]);

  const iniciar = useCallback(async () => {
    const Detector = detectorDisponivel();
    if (!Detector) {
      setErro(
        "Este navegador não lê QR Code pela câmera. Digite o código da etiqueta.",
      );
      return;
    }

    setErro(null);
    setLendo(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();

      const detector = new Detector({ formats: ["qr_code"] });

      const procurar = async () => {
        if (!streamRef.current) return;

        try {
          const encontrados = await detector.detect(video);
          const primeiro = encontrados[0];

          if (primeiro) {
            parar();
            router.push(
              `/estoque/ler?codigo=${encodeURIComponent(primeiro.rawValue)}`,
            );
            return;
          }
        } catch {
          // Quadro ilegível é normal: segue tentando no próximo.
        }

        requestAnimationFrame(() => void procurar());
      };

      void procurar();
    } catch {
      setLendo(false);
      setErro(
        "Não foi possível abrir a câmera. Verifique a permissão do navegador.",
      );
    }
  }, [parar, router]);

  return (
    <div className="space-y-4">
      {lendo ? (
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-lg border bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className="aspect-square w-full object-cover"
            />
            <div
              className="pointer-events-none absolute inset-[18%] rounded-lg border-2 border-white/80"
              aria-hidden
            />
          </div>
          <div className="text-muted-foreground flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Procurando o código…
            </span>
            <Button variant="ghost" size="sm" onClick={parar}>
              Parar
            </Button>
          </div>
        </div>
      ) : (
        <Button
          className="h-12 w-full"
          onClick={() => void iniciar()}
          disabled={!suportado}
        >
          <Camera className="size-4" aria-hidden />
          {suportado ? "Abrir a câmera" : "Câmera não suportada aqui"}
        </Button>
      )}

      {erro ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {erro}
        </p>
      ) : null}

      <form
        className="space-y-2"
        onSubmit={(evento) => {
          evento.preventDefault();
          const limpo = digitado.trim();
          if (limpo) {
            router.push(`/estoque/ler?codigo=${encodeURIComponent(limpo)}`);
          }
        }}
      >
        <Label htmlFor="codigo-digitado" className="flex items-center gap-2">
          <ScanLine className="size-4" aria-hidden />
          Ou digite o código da etiqueta
        </Label>
        <div className="flex gap-2">
          <Input
            id="codigo-digitado"
            value={digitado}
            onChange={(evento) => setDigitado(evento.target.value)}
            placeholder="EST-00431"
            className="h-11 font-mono"
            autoCapitalize="characters"
            spellCheck={false}
          />
          <Button
            type="submit"
            size="icon"
            className="size-11 shrink-0"
            aria-label="Buscar código"
            disabled={digitado.trim().length === 0}
          >
            <Search className="size-4" aria-hidden />
          </Button>
        </div>
      </form>
    </div>
  );
}
