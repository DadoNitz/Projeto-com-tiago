"use client";

import { LogOut, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Icone } from "@/components/layout/icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { Role } from "@/generated/prisma/enums";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { encerrarSessao } from "@/server/actions/auth.actions";

/**
 * Barra superior: busca rápida e menu do usuário.
 *
 * A busca leva para a listagem de estoque com o termo aplicado, em vez de
 * filtrar na tela atual — é o comportamento esperado de uma busca global, e
 * mantém um único lugar onde a filtragem acontece.
 */
export function Topbar({
  nome,
  role,
}: {
  nome: string;
  role: Role;
}) {
  const router = useRouter();
  const [termo, setTermo] = useState("");
  const [saindo, iniciarSaida] = useTransition();

  const iniciais = nome
    .split(" ")
    .slice(0, 2)
    .map((parte) => parte.charAt(0).toUpperCase())
    .join("");

  function buscar(evento: React.FormEvent) {
    evento.preventDefault();
    const limpo = termo.trim();
    router.push(
      limpo ? `/estoque/itens?q=${encodeURIComponent(limpo)}` : "/estoque/itens",
    );
  }

  function sair() {
    iniciarSaida(async () => {
      // Limpa o cache do PWA antes de sair: o Cache Storage é por origem, e
      // nada do usuário anterior pode sobrar para o próximo que logar nesta
      // mesma máquina.
      try {
        const registro = await navigator.serviceWorker?.ready;
        registro?.active?.postMessage({ type: "CLEAR_CACHES" });
      } catch {
        // Sem service worker: nada a limpar.
      }
      await encerrarSessao();
    });
  }

  return (
    <header className="bg-background/95 sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-3 backdrop-blur sm:px-4">
      <Link href="/dashboard" className="flex items-center gap-2 lg:hidden">
        <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md">
          <Icone nome="CircuitBoard" className="size-5" />
        </div>
      </Link>

      <form onSubmit={buscar} className="max-w-md flex-1" role="search">
        <div className="relative">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            value={termo}
            onChange={(evento) => setTermo(evento.target.value)}
            placeholder="Buscar peça, serial, código…"
            aria-label="Buscar no estoque"
            className="h-10 pl-9"
          />
        </div>
      </form>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-10 shrink-0 rounded-full"
              aria-label="Menu do usuário"
            />
          }
        >
          <span className="bg-muted flex size-8 items-center justify-center rounded-full text-xs font-medium">
            {iniciais || "?"}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {/*
            Cabecalho comum, e nao `DropdownMenuLabel`.

            Aquele componente e um `Menu.GroupLabel` do Base UI, que LANCA
            excecao quando nao ha um `<Menu.Group>` acima — e derrubava o menu
            inteiro no clique, deixando a pessoa sem conseguir sair.

            Alem disso ele estaria errado no lugar: este bloco diz quem voce e,
            nao rotula um grupo de comandos.
          */}
          <div className="px-1.5 py-1">
            <p className="truncate text-sm font-medium">{nome}</p>
            <p className="text-muted-foreground text-xs">{ROLE_LABELS[role]}</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={sair} disabled={saindo}>
            <LogOut className="size-4" aria-hidden />
            {saindo ? "Saindo…" : "Sair"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
