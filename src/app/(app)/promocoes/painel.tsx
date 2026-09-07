"use client";

import {
  Archive,
  Download,
  Loader2,
  Monitor,
  Plus,
  Smartphone,
  Sparkles,
  Tag,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { Segmento } from "@/domain/promotions/categorias";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatarData, formatarMoeda } from "@/lib/format";
import {
  arquivar,
  avaliar,
  coletarDoTelegram,
  novaPromocao,
} from "@/server/actions/promotion.actions";
import { cn } from "@/lib/utils";

export interface PromocaoNaTela {
  id: string;
  titulo: string;
  /** Rótulo da categoria, quando a IA soube classificar. */
  categoria: string | null;
  loja: string | null;
  precoAtual: number;
  precoNormal: number | null;
  desconto: number | null;
  frete: number | null;
  cashback: number | null;
  cupom: string | null;
  url: string | null;
  /** Link do aplicativo, quando a oferta tem um separado do de PC. */
  urlApp: string | null;
  nota: number | null;
  veredito: string | null;
  vistaEm: Date;
}

interface Referencia {
  nome: string;
  custo: number;
  data: string;
}

/**
 * Painel de promoções.
 *
 * A avaliação compara o preço com **o que você já pagou** naquela peça — é o
 * único parâmetro que importa numa operação de revenda, e o único que um site
 * de promoções não tem como saber.
 */
const FILTROS: { chave: Segmento | "tudo"; rotulo: string }[] = [
  { chave: "pc", rotulo: "Peças de PC" },
  { chave: "eletronico", rotulo: "Eletrônicos" },
  { chave: "tudo", rotulo: "Tudo" },
];

/**
 * Este navegador parece ser de celular?
 *
 * Serve só para decidir QUAL link aparece primeiro — os dois continuam
 * clicáveis. Por isso o palpite grosseiro basta: errar troca a ordem de dois
 * botões, não impede ninguém de comprar.
 */
function pareceCelular(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

export function PainelDePromocoes({
  promocoes,
  segmento,
  contagens,
  podeAvaliar,
  podeColetar,
}: {
  promocoes: PromocaoNaTela[];
  segmento: Segmento | "tudo";
  contagens: { pc: number; eletronico: number; tudo: number };
  podeAvaliar: boolean;
  /** Só quando há bot configurado e a pessoa pode gastar cota de IA. */
  podeColetar: boolean;
}) {
  const router = useRouter();
  // Abre o formulário só quando não há promoção nenhuma no sistema. Abrir
  // porque o filtro atual está vazio atrapalharia: a pessoa está olhando uma
  // aba, não pedindo para cadastrar.
  const [mostrarForm, setMostrarForm] = useState(contagens.tudo === 0);
  const [executando, iniciar] = useTransition();
  const [avaliando, setAvaliando] = useState<string | null>(null);
  const [coletando, setColetando] = useState(false);

  // Definido depois da hidratação: no servidor não existe `navigator`, e ler
  // ali faria o HTML divergir do que o cliente renderiza.
  const [noCelular, setNoCelular] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- só pode ser lido no cliente
    setNoCelular(pareceCelular());
  }, []);
  const [referencias, setReferencias] = useState<Record<string, Referencia[]>>({});

  const [campos, setCampos] = useState({
    title: "",
    storeName: "",
    currentPrice: "",
    regularPrice: "",
    shippingCost: "",
    cashbackPct: "",
    coupon: "",
    url: "",
  });

  function definir(chave: keyof typeof campos, valor: string) {
    setCampos((atual) => ({ ...atual, [chave]: valor }));
  }

  async function coletar() {
    setColetando(true);
    try {
      const resultado = await coletarDoTelegram();

      if (!resultado.ok) {
        toast.error("Não foi possível buscar", { description: resultado.error });
        return;
      }

      const { promocoesNovas, boas, duplicadas, adiadas } = resultado.data;

      // O caso comum é não ter nada novo. Dizer isso claramente evita a
      // dúvida de "será que buscou mesmo?" e o clique repetido, que gasta
      // cota à toa.
      if (promocoesNovas === 0) {
        toast.info(
          duplicadas > 0
            ? `Nada novo — ${duplicadas} oferta(s) já estavam aqui.`
            : "Nada novo no grupo.",
        );
        return;
      }

      toast.success(
        `${promocoesNovas} oferta(s) nova(s)` +
          (boas.length > 0 ? `, ${boas.length} valendo a pena` : ""),
        adiadas > 0
          ? { description: `${adiadas} ficaram para a próxima busca.` }
          : undefined,
      );
      router.refresh();
    } finally {
      setColetando(false);
    }
  }

  function salvar() {
    iniciar(async () => {
      const resultado = await novaPromocao(campos);
      if (!resultado.ok) {
        toast.error("Não foi possível salvar", { description: resultado.error });
        return;
      }
      toast.success("Promoção registrada");
      setCampos({
        title: "",
        storeName: "",
        currentPrice: "",
        regularPrice: "",
        shippingCost: "",
        cashbackPct: "",
        coupon: "",
        url: "",
      });
      setMostrarForm(false);
      router.refresh();
    });
  }

  function avaliarPromo(id: string) {
    setAvaliando(id);
    iniciar(async () => {
      const resultado = await avaliar({ id });
      setAvaliando(null);

      if (!resultado.ok) {
        toast.error("Não foi possível avaliar", { description: resultado.error });
        return;
      }

      setReferencias((atual) => ({
        ...atual,
        [id]: resultado.data.referencias,
      }));
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <nav
        aria-label="Filtrar por tipo de produto"
        className="flex flex-wrap gap-2"
      >
        {FILTROS.map((filtro) => {
          const ativo = filtro.chave === segmento;

          return (
            <Link
              key={filtro.chave}
              href={`/promocoes?segmento=${filtro.chave}`}
              aria-current={ativo ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                ativo
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {filtro.rotulo}
              <span className="ml-1.5 tabular-nums opacity-70">
                {contagens[filtro.chave]}
              </span>
            </Link>
          );
        })}
      </nav>

      {mostrarForm ? (
        <section className="bg-card space-y-3 rounded-lg border p-4">
          <h2 className="text-sm font-medium">Registrar uma oferta</h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo
              id="promo-titulo"
              rotulo="O que é"
              valor={campos.title}
              aoMudar={(v) => definir("title", v)}
              placeholder="RTX 3060 12GB Gigabyte"
              largura="sm:col-span-2"
            />
            <Campo
              id="promo-loja"
              rotulo="Loja"
              valor={campos.storeName}
              aoMudar={(v) => definir("storeName", v)}
              placeholder="Kabum, Pichau…"
            />
            <Campo
              id="promo-preco"
              rotulo="Preço da oferta"
              valor={campos.currentPrice}
              aoMudar={(v) => definir("currentPrice", v)}
              placeholder="0,00"
              numerico
            />
            <Campo
              id="promo-normal"
              rotulo="Preço normal (informado pela loja)"
              valor={campos.regularPrice}
              aoMudar={(v) => definir("regularPrice", v)}
              placeholder="0,00"
              numerico
            />
            <Campo
              id="promo-frete"
              rotulo="Frete"
              valor={campos.shippingCost}
              aoMudar={(v) => definir("shippingCost", v)}
              placeholder="0,00"
              numerico
            />
            <Campo
              id="promo-cashback"
              rotulo="Cashback (%)"
              valor={campos.cashbackPct}
              aoMudar={(v) => definir("cashbackPct", v)}
              placeholder="0"
              numerico
            />
            <Campo
              id="promo-cupom"
              rotulo="Cupom"
              valor={campos.coupon}
              aoMudar={(v) => definir("coupon", v)}
            />
            <Campo
              id="promo-url"
              rotulo="Link"
              valor={campos.url}
              aoMudar={(v) => definir("url", v)}
              placeholder="https://"
              largura="sm:col-span-2"
            />
          </div>

          <div className="flex gap-2">
            <Button
              className="h-11"
              onClick={salvar}
              disabled={
                executando ||
                campos.title.trim().length < 3 ||
                campos.currentPrice.trim() === ""
              }
            >
              {executando ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Plus className="size-4" aria-hidden />
              )}
              Salvar
            </Button>
            {promocoes.length > 0 ? (
              <Button
                variant="ghost"
                className="h-11"
                onClick={() => setMostrarForm(false)}
              >
                Cancelar
              </Button>
            ) : null}
          </div>
        </section>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button className="h-11" onClick={() => setMostrarForm(true)}>
            <Plus className="size-4" aria-hidden />
            Registrar oferta
          </Button>
          {podeColetar ? (
            <Button
              variant="outline"
              className="h-11"
              onClick={coletar}
              disabled={coletando}
            >
              {coletando ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Download className="size-4" aria-hidden />
              )}
              {coletando ? "Buscando…" : "Buscar ofertas"}
            </Button>
          ) : null}
        </div>
      )}

      {promocoes.length === 0 ? (
        contagens.tudo > 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
            Nenhuma oferta{" "}
            {segmento === "eletronico" ? "de eletrônico" : "de peça de PC"} por
            aqui. As outras abas ainda têm ofertas.
          </p>
        ) : null
      ) : (
        <ul className="space-y-3">
          {promocoes.map((promocao) => {
            const custoReal =
              promocao.precoAtual +
              (promocao.frete ?? 0) -
              ((promocao.cashback ?? 0) / 100) * promocao.precoAtual;

            return (
              <li key={promocao.id} className="bg-card rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-medium">
                      {(() => {
                        // No celular o link do app vem primeiro; no PC, o de
                        // computador. Cai no que existir quando só houver um.
                        const principal = noCelular
                          ? (promocao.urlApp ?? promocao.url)
                          : (promocao.url ?? promocao.urlApp);

                        return principal ? (
                          <a
                            href={principal}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                          >
                            {promocao.titulo}
                          </a>
                        ) : (
                          promocao.titulo
                        );
                      })()}
                    </h3>

                    {/*
                      Com dois links, os dois aparecem — e o do app vem
                      marcado. Ele nao e "a versao celular do mesmo link": leva
                      a um preco menor, com desconto em moedas que o link de PC
                      nao tem. Esconder um deles faria a pessoa pagar mais sem
                      saber que havia opcao.
                    */}
                    {promocao.url && promocao.urlApp ? (
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        <a
                          href={promocao.urlApp}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                        >
                          <Smartphone className="size-3" aria-hidden />
                          Abrir no app {noCelular ? "" : "(preço menor)"}
                        </a>
                        <a
                          href={promocao.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:bg-muted inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                        >
                          <Monitor className="size-3" aria-hidden />
                          Abrir no computador
                        </a>
                      </div>
                    ) : null}
                    <p className="text-muted-foreground text-sm">
                      {promocao.categoria ? `${promocao.categoria} · ` : ""}
                      {promocao.loja ?? "Loja não informada"} ·{" "}
                      {formatarData(promocao.vistaEm)}
                      {promocao.cupom ? ` · cupom ${promocao.cupom}` : ""}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="font-medium tabular-nums">
                      {formatarMoeda(promocao.precoAtual)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      custo real {formatarMoeda(custoReal)}
                    </p>
                  </div>
                </div>

                {promocao.veredito ? (
                  <div
                    className={cn(
                      "mt-3 rounded-md border p-3 text-sm",
                      (promocao.nota ?? 0) >= 7
                        ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                        : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
                    )}
                  >
                    <p className="mb-1 font-medium">
                      Nota {promocao.nota}/10 —{" "}
                      {(promocao.nota ?? 0) >= 7 ? "vale comprar" : "não compensa"}
                    </p>
                    <p>{promocao.veredito}</p>

                    {referencias[promocao.id]?.length ? (
                      <ul className="mt-2 space-y-0.5 text-xs opacity-90">
                        {referencias[promocao.id]!.map((referencia) => (
                          <li key={referencia.nome + referencia.data}>
                            você pagou {formatarMoeda(referencia.custo)} em{" "}
                            {referencia.nome} ({referencia.data})
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  {podeAvaliar ? (
                    <Button
                      variant="outline"
                      className="h-10"
                      onClick={() => avaliarPromo(promocao.id)}
                      disabled={executando}
                    >
                      {avaliando === promocao.id ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : (
                        <Sparkles className="size-4" aria-hidden />
                      )}
                      {promocao.veredito ? "Avaliar de novo" : "Vale a pena?"}
                    </Button>
                  ) : null}

                  <Button
                    variant="ghost"
                    className="h-10"
                    onClick={() =>
                      iniciar(async () => {
                        await arquivar({ id: promocao.id });
                        router.refresh();
                      })
                    }
                    disabled={executando}
                  >
                    <Archive className="size-4" aria-hidden />
                    Arquivar
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {promocoes.length === 0 && !mostrarForm ? (
        <div className="bg-card flex flex-col items-center gap-2 rounded-lg border px-6 py-12 text-center">
          <Tag className="text-muted-foreground size-8" aria-hidden />
          <p className="text-sm">Nenhuma oferta registrada.</p>
        </div>
      ) : null}
    </div>
  );
}

function Campo({
  id,
  rotulo,
  valor,
  aoMudar,
  placeholder,
  numerico,
  largura,
}: {
  id: string;
  rotulo: string;
  valor: string;
  aoMudar: (valor: string) => void;
  placeholder?: string;
  numerico?: boolean;
  largura?: string;
}) {
  return (
    <div className={cn("space-y-1.5", largura)}>
      <Label htmlFor={id}>{rotulo}</Label>
      <Input
        id={id}
        className="h-11"
        value={valor}
        placeholder={placeholder}
        inputMode={numerico ? "decimal" : undefined}
        onChange={(evento) => aoMudar(evento.target.value)}
      />
    </div>
  );
}
