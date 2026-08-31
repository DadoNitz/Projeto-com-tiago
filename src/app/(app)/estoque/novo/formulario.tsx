"use client";

import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Icone } from "@/components/layout/icon";
import {
  LeitorDeEtiqueta,
  type SugestaoDaEtiqueta,
} from "@/components/inventory/leitor-etiqueta";
import { SpecField } from "@/components/inventory/spec-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SpecDefinition, SpecValue } from "@/domain/specs/types";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { CONDICOES_SELECIONAVEIS, ROTULO_CONDICAO } from "@/lib/inventory-labels";
import { cadastrarPeca } from "@/server/actions/inventory.actions";
import { cn } from "@/lib/utils";

interface Opcao {
  id: string;
  name: string;
}

interface CategoriaComSpecs extends Opcao {
  slug: string;
  icon: string | null;
  specs: SpecDefinition[];
}

/**
 * Cadastro de peça, em passos (seção 23).
 *
 * A ordem segue a do enunciado: categoria, identificação, dados principais,
 * especificações. O motivo de começar pela categoria é técnico e não estético
 * — é ela que determina quais especificações existem, e portanto o formulário
 * inteiro.
 *
 * Passos, e não uma página longa, porque o uso principal é no celular em pé na
 * frente da bancada. Um formulário de 30 campos numa tela de 6 polegadas faz
 * perder o lugar a cada rolagem.
 */
export function FormularioDeCadastro({
  categorias,
  marcas,
  locais,
  socios,
  leituraDeEtiquetaDisponivel,
}: {
  categorias: CategoriaComSpecs[];
  marcas: Opcao[];
  locais: Opcao[];
  socios: Opcao[];
  /** Falso quando nao ha chave de IA: o botao some em vez de falhar ao clicar. */
  leituraDeEtiquetaDisponivel: boolean;
}) {
  const router = useRouter();
  const [enviando, iniciarEnvio] = useTransition();
  const { online } = useOnlineStatus();

  const [passo, setPasso] = useState(0);
  const [erros, setErros] = useState<Record<string, string[] | undefined>>({});

  const [categoryId, setCategoryId] = useState("");
  const [nome, setNome] = useState("");
  const [modelo, setModelo] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [brandId, setBrandId] = useState("");
  const [trackingMode, setTrackingMode] = useState<"SERIALIZED" | "QUANTITY">(
    "SERIALIZED",
  );
  const [specs, setSpecs] = useState<Record<string, SpecValue | undefined>>({});

  const [quantidade, setQuantidade] = useState(1);
  const [seriaisTexto, setSeriaisTexto] = useState("");
  const [condicao, setCondicao] =
    useState<(typeof CONDICOES_SELECIONAVEIS)[number]>("USED");
  const [locationId, setLocationId] = useState("");
  const [purchasedById, setPurchasedById] = useState("");
  const [custo, setCusto] = useState("");
  const [venda, setVenda] = useState("");
  const [origem, setOrigem] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const categoria = useMemo(
    () => categorias.find((item) => item.id === categoryId),
    [categorias, categoryId],
  );

  const seriais = useMemo(
    () =>
      seriaisTexto
        .split(/\r?\n/)
        .map((linha) => linha.trim())
        .filter(Boolean),
    [seriaisTexto],
  );

  const definirSpec = useCallback((chave: string, valor: SpecValue | undefined) => {
    setSpecs((atual) => ({ ...atual, [chave]: valor }));
  }, []);

  /**
   * Aplica o que foi lido da etiqueta.
   *
   * Nunca sobrescreve o que a pessoa ja digitou: se ela corrigiu o modelo a
   * mao e depois fotografou a etiqueta, a correcao dela vale mais que a
   * leitura automatica.
   */
  const aplicarEtiqueta = useCallback(
    (sugestao: SugestaoDaEtiqueta) => {
      if (sugestao.nomeSugerido) setNome((atual) => atual || sugestao.nomeSugerido!);
      if (sugestao.modelo) setModelo((atual) => atual || sugestao.modelo!);
      if (sugestao.partNumber) {
        setPartNumber((atual) => atual || sugestao.partNumber!);
      }

      // Serial vai para a lista de seriais, que e onde o cadastro o espera.
      if (sugestao.numeroSerie) {
        setSeriaisTexto((atual) =>
          atual.trim() ? atual : sugestao.numeroSerie!,
        );
      }

      // Marca so e aplicada se ja existir no cadastro. Criar marca nova a
      // partir de leitura automatica encheria o catalogo de variacoes de
      // grafia — exatamente o que a normalizacao de marcas evita.
      if (sugestao.marca) {
        const alvo = sugestao.marca.trim().toLowerCase();
        const encontrada = marcas.find(
          (marca) => marca.name.toLowerCase() === alvo,
        );
        if (encontrada) setBrandId((atual) => atual || encontrada.id);
      }

      setSpecs((atual) => {
        const combinado = { ...atual };
        for (const [chave, valor] of Object.entries(sugestao.specs)) {
          if (combinado[chave] === undefined || combinado[chave] === "") {
            combinado[chave] = valor;
          }
        }
        return combinado;
      });
    },
    [marcas],
  );

  const passos = [
    { titulo: "Categoria", valido: Boolean(categoryId) },
    { titulo: "Identificação", valido: nome.trim().length >= 2 },
    { titulo: "Estoque", valido: quantidade >= 1 },
    { titulo: "Especificações", valido: true },
  ];

  function enviar() {
    if (!online) {
      toast.error("Sem conexão", {
        description:
          "O cadastro só é gravado com confirmação do servidor. Tente de novo quando a conexão voltar.",
      });
      return;
    }

    iniciarEnvio(async () => {
      const especificacoes: Record<string, unknown> = {};
      for (const [chave, valor] of Object.entries(specs)) {
        if (valor !== undefined && valor !== "") especificacoes[chave] = valor;
      }

      const resultado = await cadastrarPeca({
        produto: {
          name: nome,
          model: modelo,
          partNumber,
          categoryId,
          brandId: brandId || undefined,
          trackingMode,
          lowStockThreshold: 0,
          tagIds: [],
          specs: especificacoes,
        },
        unidades: {
          quantidade,
          seriais,
          condition: condicao,
          locationId: locationId || undefined,
          purchasedById: purchasedById || undefined,
          purchaseCost: custo || undefined,
          estimatedSalePrice: venda || undefined,
          origin: origem,
          notes: observacoes,
        },
      });

      if (!resultado.ok) {
        setErros(resultado.fieldErrors ?? {});
        toast.error("Não foi possível cadastrar", {
          description: resultado.error,
        });
        return;
      }

      const { codigos } = resultado.data;
      toast.success(
        codigos.length === 1
          ? `Peça cadastrada: ${codigos[0]}`
          : `${codigos.length} unidades cadastradas`,
        {
          description:
            codigos.length > 1
              ? `Códigos ${codigos[0]} a ${codigos.at(-1)}`
              : undefined,
        },
      );
      router.push("/estoque/itens");
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <ol className="flex items-center gap-1 text-xs" aria-label="Progresso">
        {passos.map((item, indice) => (
          <li key={item.titulo} className="flex flex-1 items-center gap-1">
            <button
              type="button"
              onClick={() => setPasso(indice)}
              className={cn(
                "flex-1 rounded-md border px-2 py-1.5 transition-colors",
                indice === passo
                  ? "border-primary bg-primary text-primary-foreground"
                  : item.valido
                    ? "text-muted-foreground hover:bg-muted"
                    : "text-muted-foreground/60",
              )}
            >
              {indice + 1}. {item.titulo}
            </button>
          </li>
        ))}
      </ol>

      <div className="bg-card rounded-lg border p-4">
        {passo === 0 ? (
          <fieldset className="space-y-3">
            <legend className="mb-3 font-medium">Que tipo de peça é?</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {categorias.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setCategoryId(item.id);
                    // Trocar de categoria invalida as specs: as chaves da
                    // categoria anterior não existem na nova.
                    setSpecs({});
                    setPasso(1);
                  }}
                  className={cn(
                    "flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg border p-3 text-center text-sm transition-colors",
                    categoryId === item.id
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted",
                  )}
                >
                  <Icone nome={item.icon} className="size-5" />
                  {item.name}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        {passo === 1 ? (
          <div className="space-y-4">
            <h2 className="font-medium">Identificação da peça</h2>

            {leituraDeEtiquetaDisponivel ? (
              <LeitorDeEtiqueta
                categoryId={categoryId}
                aoAplicar={aplicarEtiqueta}
              />
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="nome">
                Nome <span className="text-destructive">*</span>
              </Label>
              <Input
                id="nome"
                className="h-11"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: GeForce RTX 3060 Ventus 2X 12GB"
                autoFocus
              />
              {erros["produto.name"] ? (
                <p className="text-destructive text-xs">
                  {erros["produto.name"][0]}
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="marca">Marca</Label>
                <select
                  id="marca"
                  className="border-input bg-background h-11 w-full rounded-md border px-3 text-sm"
                  value={brandId}
                  onChange={(e) => setBrandId(e.target.value)}
                >
                  <option value="">Não informada</option>
                  {marcas.map((marca) => (
                    <option key={marca.id} value={marca.id}>
                      {marca.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="modelo">Modelo</Label>
                <Input
                  id="modelo"
                  className="h-11"
                  value={modelo}
                  onChange={(e) => setModelo(e.target.value)}
                  placeholder="RTX 3060 VENTUS 2X 12G"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="partNumber">Part Number</Label>
              <Input
                id="partNumber"
                className="h-11"
                value={partNumber}
                onChange={(e) => setPartNumber(e.target.value)}
              />
            </div>

            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium">
                Como controlar o estoque
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <OpcaoRastreio
                  ativo={trackingMode === "SERIALIZED"}
                  titulo="Por unidade"
                  descricao="Cada peça tem seu código e serial. Para GPU, CPU, placa-mãe."
                  aoEscolher={() => setTrackingMode("SERIALIZED")}
                />
                <OpcaoRastreio
                  ativo={trackingMode === "QUANTITY"}
                  titulo="Por quantidade"
                  descricao="Só o saldo importa. Para cabos, parafusos, pasta térmica."
                  aoEscolher={() => setTrackingMode("QUANTITY")}
                />
              </div>
            </fieldset>
          </div>
        ) : null}

        {passo === 2 ? (
          <div className="space-y-4">
            <h2 className="font-medium">Dados do estoque</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="quantidade">Quantidade</Label>
                <Input
                  id="quantidade"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={200}
                  className="h-11"
                  value={quantidade}
                  onChange={(e) =>
                    setQuantidade(Math.max(1, Number(e.target.value) || 1))
                  }
                />
                <p className="text-muted-foreground text-xs">
                  {trackingMode === "SERIALIZED"
                    ? `Serão criadas ${quantidade} unidades, cada uma com seu código.`
                    : "Saldo inicial deste item."}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="condicao">Estado da peça</Label>
                <select
                  id="condicao"
                  className="border-input bg-background h-11 w-full rounded-md border px-3 text-sm"
                  value={condicao}
                  onChange={(e) =>
                    setCondicao(
                      e.target.value as (typeof CONDICOES_SELECIONAVEIS)[number],
                    )
                  }
                >
                  {CONDICOES_SELECIONAVEIS.map((item) => (
                    <option key={item} value={item}>
                      {ROTULO_CONDICAO[item]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {trackingMode === "SERIALIZED" && quantidade > 0 ? (
              <div className="space-y-1.5">
                <Label htmlFor="seriais">Números de série</Label>
                <Textarea
                  id="seriais"
                  rows={Math.min(6, Math.max(2, quantidade))}
                  value={seriaisTexto}
                  onChange={(e) => setSeriaisTexto(e.target.value)}
                  placeholder={"Um por linha.\nDeixe em branco se não tiver."}
                  className="font-mono text-sm"
                />
                <p className="text-muted-foreground text-xs">
                  {seriais.length} de {quantidade} informados. As unidades sem
                  serial ficam identificadas só pelo código interno.
                </p>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="local">Onde vai ficar</Label>
                <select
                  id="local"
                  className="border-input bg-background h-11 w-full rounded-md border px-3 text-sm"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                >
                  <option value="">Não informado</option>
                  {locais.map((local) => (
                    <option key={local.id} value={local.id}>
                      {local.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="comprador">Quem comprou</Label>
                <select
                  id="comprador"
                  className="border-input bg-background h-11 w-full rounded-md border px-3 text-sm"
                  value={purchasedById}
                  onChange={(e) => setPurchasedById(e.target.value)}
                >
                  <option value="">Não informado</option>
                  {socios.map((socio) => (
                    <option key={socio.id} value={socio.id}>
                      {socio.name}
                    </option>
                  ))}
                </select>
                <p className="text-muted-foreground text-xs">
                  Entra no extrato de quanto cada sócio investiu.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="custo">Quanto pagou (por unidade)</Label>
                <Input
                  id="custo"
                  inputMode="decimal"
                  className="h-11"
                  value={custo}
                  onChange={(e) => setCusto(e.target.value)}
                  placeholder="0,00"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="venda">Quanto pretende vender</Label>
                <Input
                  id="venda"
                  inputMode="decimal"
                  className="h-11"
                  value={venda}
                  onChange={(e) => setVenda(e.target.value)}
                  placeholder="0,00"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="origem">Origem</Label>
              <Input
                id="origem"
                className="h-11"
                value={origem}
                onChange={(e) => setOrigem(e.target.value)}
                placeholder="Fornecedor, troca com cliente, sucata…"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                rows={3}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
              />
            </div>
          </div>
        ) : null}

        {passo === 3 ? (
          <div className="space-y-4">
            <div>
              <h2 className="font-medium">
                Especificações técnicas
                {categoria ? ` · ${categoria.name}` : ""}
              </h2>
              <p className="text-muted-foreground text-sm">
                Ficam no modelo e valem para todas as unidades. Campos em branco
                são tratados como &quot;não sabemos&quot;, e não como zero.
              </p>
            </div>

            {categoria && categoria.specs.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {categoria.specs.map((definicao) => (
                  <SpecField
                    key={definicao.key}
                    definicao={definicao}
                    valor={specs[definicao.key]}
                    aoMudar={(valor) => definirSpec(definicao.key, valor)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                Esta categoria não tem especificações cadastradas.
              </p>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          className="h-11"
          disabled={passo === 0}
          onClick={() => setPasso((atual) => Math.max(0, atual - 1))}
        >
          <ArrowLeft className="size-4" aria-hidden />
          Voltar
        </Button>

        {passo < passos.length - 1 ? (
          <Button
            className="h-11"
            disabled={!passos[passo]?.valido}
            onClick={() => setPasso((atual) => atual + 1)}
          >
            Avançar
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        ) : (
          <Button
            className="h-11"
            onClick={enviar}
            disabled={enviando || !passos[0]?.valido || !passos[1]?.valido}
          >
            {enviando ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Salvando…
              </>
            ) : (
              <>
                <Check className="size-4" aria-hidden />
                Cadastrar
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

function OpcaoRastreio({
  ativo,
  titulo,
  descricao,
  aoEscolher,
}: {
  ativo: boolean;
  titulo: string;
  descricao: string;
  aoEscolher: () => void;
}) {
  return (
    <button
      type="button"
      onClick={aoEscolher}
      aria-pressed={ativo}
      className={cn(
        "rounded-lg border p-3 text-left transition-colors",
        ativo ? "border-primary bg-primary/5" : "hover:bg-muted",
      )}
    >
      <span className="block text-sm font-medium">{titulo}</span>
      <span className="text-muted-foreground block text-xs">{descricao}</span>
    </button>
  );
}
