"use client";

import { ContextMenu } from "@base-ui/react/context-menu";
import {
  ArrowUpRight,
  MapPin,
  MoreHorizontal,
  Pencil,
  Trash2,
  LoaderCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Icone } from "@/components/layout/icon";
import { ConditionBadge, StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { UnitCondition, UnitStatus } from "@/generated/prisma/enums";
import { formatarMoeda } from "@/lib/format";
import {
  CONDICOES_SELECIONAVEIS,
  ROTULO_CONDICAO,
} from "@/lib/inventory-labels";
import {
  removerUnidade,
  salvarResumoUnidade,
} from "@/server/actions/edit.actions";

export interface ItemEstoque {
  id: string;
  nome: string;
  marca: string;
  codigo: string;
  icone: string | null;
  local: string | null;
  condition: UnitCondition;
  status: UnitStatus;
  quantidade: number;
  custo: number | null;
  valor: number | null;
}

export function ListaEstoque({
  itens,
  podeEditar,
  podeExcluir,
}: {
  itens: ItemEstoque[];
  podeEditar: boolean;
  podeExcluir: boolean;
}) {
  const router = useRouter();
  const [selecao, setSelecao] = useState<{
    item: ItemEstoque;
    modo: "editar" | "excluir";
  } | null>(null);
  const editar = (item: ItemEstoque) => setSelecao({ item, modo: "editar" });
  const excluir = (item: ItemEstoque) => setSelecao({ item, modo: "excluir" });

  return (
    <>
      <div
        className="hidden grid-cols-[minmax(0,1fr)_150px_140px_144px] gap-4 px-5 pb-3 text-xs font-medium text-muted-foreground lg:grid"
        aria-hidden
      >
        <span>PEÇA / LOCAL</span>
        <span>SITUAÇÃO</span>
        <span className="text-right">VALOR DE VENDA</span>
        <span className="text-right">AÇÕES</span>
      </div>
      <ul className="space-y-3 lg:space-y-2" aria-label="Peças do estoque">
        {itens.map((item) => {
          const editavel = podeEditar && item.status !== "DISCARDED";
          const href = `/estoque/itens/${item.id}`;
          const opcoes = [
            {
              rotulo: "Ver detalhes",
              icone: ArrowUpRight,
              acao: () => router.push(href),
            },
            ...(editavel
              ? [
                  {
                    rotulo: "Edição rápida",
                    icone: Pencil,
                    acao: () => editar(item),
                  },
                  {
                    rotulo: "Editar ficha completa",
                    icone: ArrowUpRight,
                    acao: () => router.push(`${href}/editar`),
                  },
                ]
              : []),
            ...(podeExcluir
              ? [
                  {
                    rotulo: "Excluir peça",
                    icone: Trash2,
                    acao: () => excluir(item),
                  },
                ]
              : []),
          ];
          return (
            <li key={item.id}>
              <ContextMenu.Root>
                <ContextMenu.Trigger className="inventory-item bg-card rounded-2xl border p-4 transition-colors hover:border-primary/35 lg:px-5">
                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 lg:grid-cols-[minmax(0,1fr)_150px_140px_144px] lg:gap-4">
                    <Link
                      href={href}
                      className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="bg-primary/8 text-primary flex size-11 shrink-0 items-center justify-center rounded-xl">
                        <Icone nome={item.icone} className="size-5" />
                      </span>
                      <span className="min-w-0">
                        <span
                          className="line-clamp-2 text-sm leading-5 font-semibold [overflow-wrap:anywhere] lg:line-clamp-1"
                          title={item.nome}
                        >
                          {item.nome}
                        </span>
                        <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                          {item.marca} · {item.codigo}
                        </span>
                        <span className="text-muted-foreground mt-1 hidden items-center gap-1 text-xs lg:flex">
                          <MapPin className="size-3 shrink-0" aria-hidden />
                          <span className="truncate">
                            {item.local ?? "Sem local definido"}
                          </span>
                        </span>
                      </span>
                    </Link>
                    <div className="col-span-2 row-start-2 flex flex-wrap gap-1.5 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:flex-col lg:items-start">
                      <StatusBadge status={item.status} />
                      <ConditionBadge condition={item.condition} />
                      <span className="text-muted-foreground text-xs lg:hidden">
                        {item.local}
                      </span>
                    </div>
                    <div className="col-start-1 row-start-3 min-w-0 border-t pt-3 lg:col-start-3 lg:row-start-1 lg:border-0 lg:pt-0 lg:text-right">
                      <span className="text-muted-foreground block text-[11px] lg:hidden">
                        Venda estimada
                      </span>
                      {editavel ? (
                        <button
                          type="button"
                          onClick={() => editar(item)}
                          className="text-primary -ml-2 inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg px-2 text-base font-semibold tabular-nums hover:bg-primary/8 lg:text-sm"
                          aria-label={`Editar valor de ${item.nome}`}
                        >
                          <span className="break-words">
                            {item.valor === null
                              ? "Definir valor"
                              : formatarMoeda(item.valor)}
                          </span>
                          <Pencil className="size-3 shrink-0" aria-hidden />
                        </button>
                      ) : (
                        <span className="block py-2 text-base font-semibold tabular-nums lg:text-sm">
                          {formatarMoeda(item.valor)}
                        </span>
                      )}
                      <span className="text-muted-foreground block text-[11px]">
                        {item.quantidade}{" "}
                        {item.quantidade === 1 ? "unidade" : "unidades"} · valor
                        unitário
                      </span>
                    </div>
                    <div className="col-start-2 row-start-3 flex items-center justify-end self-stretch border-t pt-3 lg:col-start-4 lg:row-start-1 lg:border-0 lg:pt-0">
                      {editavel && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => editar(item)}
                          aria-label={`Editar ${item.nome}`}
                          title="Edição rápida"
                        >
                          <Pencil className="size-4" />
                        </Button>
                      )}
                      {podeExcluir && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => excluir(item)}
                          aria-label={`Excluir ${item.nome}`}
                          title="Excluir peça"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Opções de ${item.nome}`}
                            />
                          }
                        >
                          <MoreHorizontal className="size-5" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          {opcoes.map((opcao) => (
                            <DropdownMenuItem
                              key={opcao.rotulo}
                              onClick={opcao.acao}
                              variant={
                                opcao.rotulo === "Excluir peça"
                                  ? "destructive"
                                  : "default"
                              }
                            >
                              <opcao.icone className="size-4" />
                              {opcao.rotulo}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          <p className="text-muted-foreground px-2 py-1 text-xs">
                            {item.codigo}
                          </p>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </ContextMenu.Trigger>
                <ContextMenu.Portal>
                  <ContextMenu.Positioner className="z-50" sideOffset={6}>
                    <ContextMenu.Popup className="bg-popover text-popover-foreground w-56 rounded-xl border p-1.5 shadow-lg outline-none">
                      <p className="text-muted-foreground truncate px-3 py-2 text-xs">
                        {item.codigo}
                      </p>
                      {opcoes.map((opcao) => (
                        <ContextMenu.Item
                          key={opcao.rotulo}
                          onClick={opcao.acao}
                          className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm outline-none data-highlighted:bg-muted ${opcao.rotulo === "Excluir peça" ? "text-destructive" : ""}`}
                        >
                          <opcao.icone className="size-4" aria-hidden />
                          {opcao.rotulo}
                        </ContextMenu.Item>
                      ))}
                    </ContextMenu.Popup>
                  </ContextMenu.Positioner>
                </ContextMenu.Portal>
              </ContextMenu.Root>
            </li>
          );
        })}
      </ul>
      {selecao && (
        <EditorItem
          key={`${selecao.item.id}-${selecao.modo}`}
          {...selecao}
          fechar={() => setSelecao(null)}
        />
      )}
    </>
  );
}

function EditorItem({
  item,
  modo,
  fechar,
}: {
  item: ItemEstoque;
  modo: "editar" | "excluir";
  fechar: () => void;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const apagando = modo === "excluir";
  function salvar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const dados = new FormData(event.currentTarget);
    const numero = (chave: string) => {
      const texto = String(dados.get(chave) ?? "").trim();
      return texto === "" ? null : Number(texto.replace(",", "."));
    };
    setErro(null);
    if (
      !apagando &&
      [numero("custo"), numero("valor")].some(
        (valor) =>
          valor !== null &&
          (!Number.isFinite(valor) || valor < 0 || valor > 999999999),
      )
    ) {
      setErro(
        "Informe valores entre 0 e 999.999.999, usando vírgula para os centavos.",
      );
      return;
    }
    iniciar(async () => {
      try {
        const resultado = apagando
          ? await removerUnidade({
              id: item.id,
              motivo: String(dados.get("motivo") ?? ""),
            })
          : await salvarResumoUnidade({
              id: item.id,
              condition: dados.get("condition"),
              purchaseCost: numero("custo"),
              estimatedSalePrice: numero("valor"),
            });
        if (!resultado.ok) {
          setErro(resultado.error);
          return;
        }
        toast.success(
          apagando ? "Peça excluída do estoque." : "Peça atualizada.",
        );
        fechar();
        router.refresh();
      } catch {
        setErro(
          "Não foi possível concluir. Confira sua conexão e tente novamente.",
        );
      }
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(aberto, detalhes) => {
        if (pendente) detalhes.cancel();
        else if (!aberto) fechar();
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={!pendente}>
        <DialogHeader>
          <DialogTitle>
            {apagando ? "Excluir esta peça?" : "Edição rápida"}
          </DialogTitle>
          <DialogDescription className="break-words pr-6">
            {item.nome} · {item.codigo}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="space-y-5">
          {apagando ? (
            <>
              <p className="text-muted-foreground text-sm">
                A peça será removida da listagem. Peças com movimentações ou
                montagens são protegidas pelo histórico do sistema.
              </p>
              <div className="space-y-2">
                <Label htmlFor="motivo-exclusao">Motivo (opcional)</Label>
                <Input
                  id="motivo-exclusao"
                  name="motivo"
                  maxLength={500}
                  placeholder="Ex.: cadastro duplicado"
                  disabled={pendente}
                />
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="custo-rapido">Custo (R$)</Label>
                  <Input
                    id="custo-rapido"
                    name="custo"
                    inputMode="decimal"
                    defaultValue={
                      item.custo?.toFixed(2).replace(".", ",") ?? ""
                    }
                    placeholder="0,00"
                    disabled={pendente}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="valor-rapido">Venda (R$)</Label>
                  <Input
                    id="valor-rapido"
                    name="valor"
                    inputMode="decimal"
                    defaultValue={
                      item.valor?.toFixed(2).replace(".", ",") ?? ""
                    }
                    placeholder="0,00"
                    disabled={pendente}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="condicao-rapida">Estado da peça</Label>
                <select
                  id="condicao-rapida"
                  name="condition"
                  defaultValue={item.condition}
                  disabled={pendente}
                  className="bg-background border-input h-11 w-full rounded-lg border px-3"
                >
                  {CONDICOES_SELECIONAVEIS.map((condicao) => (
                    <option key={condicao} value={condicao}>
                      {ROTULO_CONDICAO[condicao]}
                    </option>
                  ))}
                </select>
              </div>
              <Link
                href={`/estoque/itens/${item.id}/editar`}
                className="text-primary inline-flex min-h-11 items-center gap-2 text-sm font-medium"
                aria-disabled={pendente}
                tabIndex={pendente ? -1 : undefined}
                onClick={(evento) => {
                  if (pendente) evento.preventDefault();
                }}
              >
                Editar nome, serial e ficha completa
                <ArrowUpRight className="size-4" />
              </Link>
            </>
          )}
          {erro && (
            <p
              role="alert"
              className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm"
            >
              {erro}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pendente}
              onClick={fechar}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant={apagando ? "destructive" : "default"}
              disabled={pendente}
            >
              {pendente && <LoaderCircle className="size-4 animate-spin" />}
              {pendente
                ? "Aguarde…"
                : apagando
                  ? "Excluir peça"
                  : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
