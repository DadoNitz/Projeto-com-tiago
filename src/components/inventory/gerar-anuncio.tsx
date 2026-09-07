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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Confianca, SugestaoDePreco } from "@/domain/pricing/preco-de-venda";
import { formatarMoeda } from "@/lib/format";
import {
  sugerirPrecoDaMontagem,
  sugerirPrecoDaPeca,
} from "@/server/actions/pricing.actions";
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

const ROTULO_CONFIANCA: Record<Confianca, string> = {
  alta: "boa base de dados",
  media: "dados parciais",
  baixa: "dados fracos",
};

const COR_CONFIANCA: Record<Confianca, string> = {
  alta: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  media: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  baixa: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
};

/**
 * Gera o texto do anúncio a partir dos dados cadastrados.
 *
 * O texto sai como rascunho e é copiado manualmente para a plataforma. O
 * sistema não publica nada sozinho e não guarda credencial de marketplace —
 * publicar em nome de alguém é uma responsabilidade que ele não deve assumir.
 *
 * O preço aparece antes do botão de gerar, e não depois, porque ele é decisão
 * de quem vende: o texto se escreve em torno do valor. A sugestão vem de conta
 * feita no servidor sobre custo, preço estimado das peças e vendas anteriores
 * (`@/domain/pricing/preco-de-venda`) — a IA recebe o número já decidido e
 * nunca opina sobre ele.
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

  const [sugestao, setSugestao] = useState<SugestaoDePreco | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [semSugestao, setSemSugestao] = useState<string | null>(null);
  const [preco, setPreco] = useState(
    precoSugerido && precoSugerido > 0 ? String(Math.round(precoSugerido)) : "",
  );
  /**
   * Trava o campo contra a sugestão.
   *
   * Já nasce travado quando existe preço decidido — o pretendido da montagem,
   * o estimado da peça. Aquele número foi alguém que digitou; a sugestão é
   * conta de máquina, e não deve passar por cima de uma decisão que já foi
   * tomada. Ela continua visível ao lado, que é o que serve para reconsiderar.
   */
  const [precoTocado, setPrecoTocado] = useState(
    Boolean(precoSugerido && precoSugerido > 0),
  );

  /**
   * Busca a sugestão ao abrir o diálogo.
   *
   * Ao abrir, e não ao montar: é uma consulta ao banco por montagem, e a tela
   * "Minhas montagens" renderiza este componente uma vez por linha. Calcular
   * todas de antemão custaria dezenas de consultas para um número que quase
   * sempre ninguém vai olhar.
   */
  async function abrir(estado: boolean) {
    setAberto(estado);
    if (!estado || sugestao || calculando || semSugestao) return;

    setCalculando(true);

    const resultado = buildId
      ? await sugerirPrecoDaMontagem({ id: buildId })
      : unitId
        ? await sugerirPrecoDaPeca({ id: unitId })
        : null;

    setCalculando(false);

    if (!resultado || !resultado.ok) {
      setSemSugestao(
        resultado && !resultado.ok
          ? resultado.error
          : "Não foi possível calcular agora.",
      );
      return;
    }

    if (!resultado.data) {
      setSemSugestao(
        "As peças não têm custo nem preço de venda cadastrados, então não há " +
          "como sugerir um valor. Preencha o preço à mão.",
      );
      return;
    }

    setSugestao(resultado.data);
    // O valor do anúncio já vem com o espaço de negociação embutido.
    if (!precoTocado) setPreco(String(resultado.data.anuncio));
  }

  async function gerar() {
    setGerando(true);
    setAnuncio(null);

    try {
      const resposta = await fetch("/api/ia/anuncio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          unitId,
          buildId,
          canal,
          preco: paraValor(preco) ?? precoSugerido,
        }),
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
    <Dialog open={aberto} onOpenChange={(estado) => void abrir(estado)}>
      <DialogTrigger render={<Button variant="outline" className="h-11" />}>
        <Megaphone className="size-4" aria-hidden />
        Anunciar
      </DialogTrigger>

      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Anunciar</DialogTitle>
          <DialogDescription>
            O texto usa só as especificações cadastradas e o valor que você
            confirmar aqui. Confira antes de publicar — o sistema não publica
            nada sozinho.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-4 pb-4">
          <section className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Sugestão de valor</h3>
              {sugestao ? (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    COR_CONFIANCA[sugestao.confianca],
                  )}
                >
                  {ROTULO_CONFIANCA[sugestao.confianca]}
                </span>
              ) : null}
            </div>

            {calculando ? (
              <p className="text-muted-foreground mt-2 flex items-center gap-2 text-sm">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                Calculando pelo custo das peças e pelas vendas anteriores…
              </p>
            ) : sugestao ? (
              <>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <Valor
                    rotulo="Anuncie por"
                    valor={sugestao.anuncio}
                    destaque
                  />
                  <Valor rotulo="Espere fechar" valor={sugestao.alvo} />
                  <Valor rotulo="Não aceite menos" valor={sugestao.minimo} />
                </dl>

                <ul className="text-muted-foreground mt-3 space-y-1 text-xs">
                  {sugestao.custo > 0 ? (
                    <li>
                      As peças custaram {formatarMoeda(sugestao.custo)}.
                    </li>
                  ) : null}
                  {sugestao.motivos.map((motivo) => (
                    <li key={motivo}>{motivo}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-muted-foreground mt-2 text-sm">
                {semSugestao ?? "Abra para calcular."}
              </p>
            )}

            <div className="mt-3 space-y-1.5">
              <Label htmlFor="anuncio-preco">Valor no anúncio</Label>
              <Input
                id="anuncio-preco"
                inputMode="decimal"
                className="h-11"
                value={preco}
                onChange={(evento) => {
                  setPrecoTocado(true);
                  setPreco(evento.target.value);
                }}
                placeholder="0,00"
              />
              <p className="text-muted-foreground text-xs">
                É este valor que entra no texto. Em branco, o anúncio sai sem
                preço.
              </p>
            </div>
          </section>

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
              "Gerar título e descrição"
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

function Valor({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: number;
  destaque?: boolean;
}) {
  return (
    <div className="bg-muted/50 rounded-md p-2">
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd
        className={cn(
          "tabular-nums",
          destaque ? "text-base font-semibold" : "text-sm font-medium",
        )}
      >
        {formatarMoeda(valor)}
      </dd>
    </div>
  );
}

/**
 * Lê o valor digitado no formato brasileiro.
 *
 * "2.590,00" e "2590" precisam dar no mesmo número: o campo aceita o que a
 * pessoa naturalmente digita, e o ponto aqui é separador de milhar, não
 * decimal.
 */
function paraValor(texto: string): number | undefined {
  const limpo = texto.trim().replace(/\./g, "").replace(",", ".");
  if (limpo === "") return undefined;
  const numero = Number(limpo);
  return Number.isFinite(numero) && numero > 0 ? numero : undefined;
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
