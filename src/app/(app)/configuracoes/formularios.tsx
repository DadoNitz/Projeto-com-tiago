"use client";

import { Loader2, Plus, Power, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/server/actions/run-action";
import {
  alternarSocio,
  editarMarca,
  novaMarca,
  novoLocal,
  novoSocio,
  removerLocal,
  removerMarca,
} from "@/server/actions/catalog.actions";

interface Item {
  id: string;
  nome: string;
  detalhe?: string;
  ativo?: boolean;
  /** Quantos registros dependem deste. Bloqueia a exclusão quando > 0. */
  emUso?: number;
}

/**
 * Cadastro dos catálogos de apoio.
 *
 * A exclusão é sempre condicional: uma marca em uso por produtos e um local
 * com peças dentro não podem sumir. A mensagem explica o motivo e o caminho —
 * "transfira as peças antes" vale mais que "não é possível excluir".
 */
export function ListaEditavel({
  titulo,
  descricao,
  tipo,
  itens,
  camposExtras,
}: {
  titulo: string;
  descricao: string;
  tipo: "marca" | "local" | "socio";
  itens: Item[];
  camposExtras?: { chave: string; rotulo: string; placeholder?: string }[];
}) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [extras, setExtras] = useState<Record<string, string>>({});
  const [executando, iniciar] = useTransition();

  function tratar(
    promessa: Promise<ActionResult<unknown>>,
    sucesso: string,
  ) {
    iniciar(async () => {
      const resultado = await promessa;
      if (!resultado.ok) {
        toast.error("Não foi possível", { description: resultado.error });
        return;
      }
      toast.success(sucesso);
      setNome("");
      setExtras({});
      router.refresh();
    });
  }

  function adicionar() {
    const dados = { name: nome, ...extras };

    if (tipo === "marca") tratar(novaMarca(dados), "Marca cadastrada");
    else if (tipo === "local") tratar(novoLocal(dados), "Local cadastrado");
    else tratar(novoSocio(dados), "Sócio cadastrado");
  }

  function remover(item: Item) {
    if (tipo === "marca") {
      tratar(removerMarca({ id: item.id }), `${item.nome} removida`);
    } else if (tipo === "local") {
      tratar(removerLocal({ id: item.id }), `${item.nome} removido`);
    } else {
      tratar(
        alternarSocio({ id: item.id, ativo: item.ativo === false }),
        item.ativo === false ? `${item.nome} reativado` : `${item.nome} desativado`,
      );
    }
  }

  return (
    <section className="bg-card rounded-lg border">
      <header className="border-b px-4 py-3">
        <h2 className="text-sm font-medium">{titulo}</h2>
        <p className="text-muted-foreground text-xs">{descricao}</p>
      </header>

      <div className="space-y-3 border-b p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${tipo}-nome`}>Nome</Label>
            <Input
              id={`${tipo}-nome`}
              className="h-11"
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
            />
          </div>

          {camposExtras?.map((campo) => (
            <div key={campo.chave} className="space-y-1.5">
              <Label htmlFor={`${tipo}-${campo.chave}`}>{campo.rotulo}</Label>
              <Input
                id={`${tipo}-${campo.chave}`}
                className="h-11"
                placeholder={campo.placeholder}
                value={extras[campo.chave] ?? ""}
                onChange={(evento) =>
                  setExtras((atual) => ({
                    ...atual,
                    [campo.chave]: evento.target.value,
                  }))
                }
              />
            </div>
          ))}
        </div>

        <Button
          className="h-11"
          onClick={adicionar}
          disabled={executando || nome.trim().length < 1}
        >
          {executando ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="size-4" aria-hidden />
          )}
          Adicionar
        </Button>
      </div>

      <ul className="max-h-80 divide-y overflow-y-auto">
        {itens.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-3 px-4 py-2.5 text-sm"
          >
            <span className="min-w-0 flex-1">
              <span
                className={
                  item.ativo === false ? "text-muted-foreground" : undefined
                }
              >
                {item.nome}
              </span>
              {item.detalhe ? (
                <span className="text-muted-foreground block text-xs">
                  {item.detalhe}
                </span>
              ) : null}
            </span>

            {tipo === "marca" ? (
              <BotaoRenomear
                id={item.id}
                nomeAtual={item.nome}
                aoConcluir={() => router.refresh()}
              />
            ) : null}

            <Button
              variant="ghost"
              size="icon"
              className="size-9 shrink-0"
              onClick={() => remover(item)}
              disabled={executando}
              aria-label={
                tipo === "socio"
                  ? item.ativo === false
                    ? "Reativar"
                    : "Desativar"
                  : "Excluir"
              }
              title={
                item.emUso
                  ? `Em uso por ${item.emUso} registro(s)`
                  : undefined
              }
            >
              {tipo === "socio" ? (
                <Power className="size-4" aria-hidden />
              ) : (
                <Trash2 className="size-4" aria-hidden />
              )}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BotaoRenomear({
  id,
  nomeAtual,
  aoConcluir,
}: {
  id: string;
  nomeAtual: string;
  aoConcluir: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(nomeAtual);
  const [salvando, iniciar] = useTransition();

  if (!editando) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0"
        onClick={() => setEditando(true)}
      >
        Renomear
      </Button>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-1">
      <Input
        value={nome}
        onChange={(evento) => setNome(evento.target.value)}
        className="h-9 w-40"
        autoFocus
      />
      <Button
        size="sm"
        disabled={salvando}
        onClick={() =>
          iniciar(async () => {
            const resultado = await editarMarca({ id, name: nome });
            if (!resultado.ok) {
              toast.error("Não foi possível renomear", {
                description: resultado.error,
              });
              return;
            }
            setEditando(false);
            aoConcluir();
          })
        }
      >
        Salvar
      </Button>
    </span>
  );
}
