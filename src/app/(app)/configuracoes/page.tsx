import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { can, ROLE_LABELS } from "@/lib/auth/permissions";
import {
  caminhoDoLocal,
  listarCategorias,
  listarLocais,
  listarMarcasComUso,
  listarSociosComUso,
} from "@/server/services/catalog.service";
import { requireContext } from "@/server/session";

import { ListaEditavel } from "./formularios";

export const metadata: Metadata = { title: "Configurações" };
export const dynamic = "force-dynamic";

/**
 * Cadastros de apoio.
 *
 * Categorias aparecem apenas para consulta: criar uma categoria sem definir
 * suas especificações produziria um formulário de cadastro vazio e uma
 * categoria que o motor de compatibilidade não conhece. Elas nascem do
 * catálogo versionado em código, aplicado pelo seed.
 */
export default async function ConfiguracoesPage() {
  const ctx = await requireContext();
  if (!can(ctx.role, "catalog:write")) redirect("/dashboard");

  const [marcas, locais, socios, categorias] = await Promise.all([
    listarMarcasComUso(),
    listarLocais(),
    listarSociosComUso(),
    listarCategorias(),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Configurações
        </h1>
        <p className="text-muted-foreground text-sm">
          Você está como {ROLE_LABELS[ctx.role].toLowerCase()}.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListaEditavel
          titulo="Marcas"
          descricao="Normalizadas para que a mesma marca não vire três nomes diferentes."
          tipo="marca"
          itens={marcas.map((marca) => ({
            id: marca.id,
            nome: marca.name,
            detalhe:
              marca._count.products > 0
                ? `${marca._count.products} produto(s)`
                : "sem produtos",
            emUso: marca._count.products,
          }))}
          camposExtras={[
            { chave: "website", rotulo: "Site (opcional)", placeholder: "https://" },
          ]}
        />

        <ListaEditavel
          titulo="Locais"
          descricao="Onde as peças ficam guardadas. Aceita hierarquia."
          tipo="local"
          itens={locais.map((local) => ({
            id: local.id,
            nome: caminhoDoLocal(locais, local.id) || local.name,
            detalhe: local.code ?? undefined,
          }))}
          camposExtras={[
            { chave: "code", rotulo: "Código (opcional)", placeholder: "DEP-A1" },
          ]}
        />

        <ListaEditavel
          titulo="Sócios"
          descricao="Quem financia as peças. Desativar preserva o extrato; excluir apagaria a resposta de quem pagou pelo quê."
          tipo="socio"
          itens={socios.map((socio) => ({
            id: socio.id,
            nome: socio.name,
            detalhe:
              socio._count.purchasedUnits > 0
                ? `${socio._count.purchasedUnits} peça(s) compradas`
                : socio.email ?? undefined,
            ativo: socio.active,
          }))}
          camposExtras={[
            { chave: "email", rotulo: "E-mail (opcional)" },
            { chave: "phone", rotulo: "Telefone (opcional)" },
          ]}
        />

        <section className="bg-card rounded-lg border">
          <header className="border-b px-4 py-3">
            <h2 className="text-sm font-medium">Categorias</h2>
            <p className="text-muted-foreground text-xs">
              Definidas no catálogo do sistema, junto com as especificações de
              cada uma. Somente consulta.
            </p>
          </header>
          <ul className="max-h-80 divide-y overflow-y-auto">
            {categorias.map((categoria) => (
              <li
                key={categoria.id}
                className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <span>{categoria.name}</span>
                <span className="text-muted-foreground text-xs">
                  {categoria._count.products} produto(s)
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
