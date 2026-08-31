"use client";

import { Filter, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  CONDICOES_SELECIONAVEIS,
  ROTULO_CONDICAO,
  ROTULO_STATUS,
  STATUS_SELECIONAVEIS,
} from "@/lib/inventory-labels";
import { cn } from "@/lib/utils";

interface Opcao {
  id: string;
  name: string;
}

/**
 * Filtros da listagem (seção 5).
 *
 * O estado vive na URL, não em `useState`. Isso faz o filtro sobreviver ao
 * recarregar, permite compartilhar um link já filtrado e mantém o botão
 * "voltar" do navegador coerente — que é o que se espera de uma listagem.
 *
 * No celular os filtros ficam dentro de um painel deslizante: numa tela
 * estreita, uma barra de filtros fixa consumiria metade do espaço útil.
 */
export function Filtros({
  categorias,
  marcas,
  locais,
  totalAtivos,
  variante,
}: {
  categorias: Opcao[];
  marcas: Opcao[];
  locais: Opcao[];
  totalAtivos: number;
  /**
   * Onde este filtro esta sendo renderizado. Explicito, e nao por classe
   * responsiva interna, porque no desktop o painel vive na coluna lateral e no
   * celular vive dentro de um botao no cabecalho: sao posicoes diferentes na
   * arvore, nao apenas estilos diferentes.
   */
  variante: "mobile" | "desktop";
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [aberto, setAberto] = useState(false);

  const aplicar = useCallback(
    (mudancas: Record<string, string | string[] | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      for (const [chave, valor] of Object.entries(mudancas)) {
        params.delete(chave);
        if (valor === null || valor === "") continue;
        if (Array.isArray(valor)) {
          for (const item of valor) params.append(chave, item);
        } else {
          params.set(chave, valor);
        }
      }

      // Trocar de filtro invalida o cursor da página anterior.
      params.delete("cursor");

      router.push(`/estoque/itens?${params.toString()}`);
      setAberto(false);
    },
    [router, searchParams],
  );

  const limpar = useCallback(() => {
    router.push("/estoque/itens");
    setAberto(false);
  }, [router]);

  const statusAtivos = searchParams.getAll("status");
  const condicoesAtivas = searchParams.getAll("condition");

  function alternar(chave: string, valor: string, atuais: string[]) {
    const novos = atuais.includes(valor)
      ? atuais.filter((item) => item !== valor)
      : [...atuais, valor];
    aplicar({ [chave]: novos });
  }

  const corpo = (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Situação</legend>
        <div className="flex flex-wrap gap-2">
          {STATUS_SELECIONAVEIS.map((status) => {
            const ativo = statusAtivos.includes(status);
            return (
              <button
                key={status}
                type="button"
                aria-pressed={ativo}
                onClick={() => alternar("status", status, statusAtivos)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors",
                  ativo
                    ? "bg-primary text-primary-foreground border-primary"
                    : "hover:bg-muted",
                )}
              >
                {ROTULO_STATUS[status]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Estado da peça</legend>
        <div className="flex flex-wrap gap-2">
          {CONDICOES_SELECIONAVEIS.map((condicao) => {
            const ativo = condicoesAtivas.includes(condicao);
            return (
              <button
                key={condicao}
                type="button"
                aria-pressed={ativo}
                onClick={() => alternar("condition", condicao, condicoesAtivas)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors",
                  ativo
                    ? "bg-primary text-primary-foreground border-primary"
                    : "hover:bg-muted",
                )}
              >
                {ROTULO_CONDICAO[condicao]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <SeletorSimples
          rotulo="Categoria"
          chave="categoryId"
          opcoes={categorias}
          valor={searchParams.get("categoryId") ?? ""}
          aoMudar={aplicar}
        />
        <SeletorSimples
          rotulo="Marca"
          chave="brandId"
          opcoes={marcas}
          valor={searchParams.get("brandId") ?? ""}
          aoMudar={aplicar}
        />
        <SeletorSimples
          rotulo="Localização"
          chave="locationId"
          opcoes={locais}
          valor={searchParams.get("locationId") ?? ""}
          aoMudar={aplicar}
        />
        <div className="space-y-2">
          <Label htmlFor="ordenacao">Ordenar por</Label>
          <select
            id="ordenacao"
            className="border-input bg-background h-11 w-full rounded-md border px-3 text-sm"
            value={searchParams.get("ordenacao") ?? "recentes"}
            onChange={(evento) => aplicar({ ordenacao: evento.target.value })}
          >
            <option value="recentes">Mais recentes</option>
            <option value="antigos">Mais antigos</option>
            <option value="nome">Nome</option>
            <option value="valor-maior">Maior valor</option>
            <option value="valor-menor">Menor valor</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="precoMin">Valor mínimo</Label>
          <Input
            id="precoMin"
            type="number"
            inputMode="decimal"
            min={0}
            className="h-11"
            defaultValue={searchParams.get("precoMin") ?? ""}
            onBlur={(evento) => aplicar({ precoMin: evento.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="precoMax">Valor máximo</Label>
          <Input
            id="precoMax"
            type="number"
            inputMode="decimal"
            min={0}
            className="h-11"
            defaultValue={searchParams.get("precoMax") ?? ""}
            onBlur={(evento) => aplicar({ precoMax: evento.target.value })}
          />
        </div>
      </div>
    </div>
  );

  if (variante === "desktop") {
    return (
      <div className="bg-card rounded-lg border p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium">Filtros</h2>
          {totalAtivos > 0 ? (
            <Button variant="ghost" size="sm" onClick={limpar}>
              <X className="size-3.5" aria-hidden />
              Limpar
            </Button>
          ) : null}
        </div>
        {corpo}
      </div>
    );
  }

  return (
    <>
      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetTrigger render={<Button variant="outline" className="h-10" />}>
          <Filter className="size-4" aria-hidden />
          Filtros
          {totalAtivos > 0 ? (
            <span className="bg-primary text-primary-foreground ml-1 rounded-full px-1.5 text-xs">
              {totalAtivos}
            </span>
          ) : null}
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Filtros</SheetTitle>
            <SheetDescription>
              Refine a busca no estoque.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4">{corpo}</div>
          <SheetFooter>
            <Button variant="outline" onClick={limpar} className="h-11">
              Limpar tudo
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

function SeletorSimples({
  rotulo,
  chave,
  opcoes,
  valor,
  aoMudar,
}: {
  rotulo: string;
  chave: string;
  opcoes: Opcao[];
  valor: string;
  aoMudar: (mudancas: Record<string, string | null>) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={chave}>{rotulo}</Label>
      <select
        id={chave}
        className="border-input bg-background h-11 w-full rounded-md border px-3 text-sm"
        value={valor}
        onChange={(evento) => aoMudar({ [chave]: evento.target.value || null })}
      >
        <option value="">Todas</option>
        {opcoes.map((opcao) => (
          <option key={opcao.id} value={opcao.id}>
            {opcao.name}
          </option>
        ))}
      </select>
    </div>
  );
}
