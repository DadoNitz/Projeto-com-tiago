import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { iaDisponivel } from "@/lib/ai";
import { can } from "@/lib/auth/permissions";
import {
  definicoesDeSpec,
  listarCategorias,
  listarLocais,
  listarMarcas,
} from "@/server/services/catalog.service";
import { listarSocios } from "@/server/services/partner.service";
import { requireContext } from "@/server/session";

import { FormularioDeCadastro } from "./formulario";

export const metadata: Metadata = { title: "Adicionar peça" };
export const dynamic = "force-dynamic";

export default async function NovaPecaPage() {
  const ctx = await requireContext();
  // Autorização no servidor. A interface já esconde o botão, mas quem decide
  // é aqui: esconder não é proteger.
  if (!can(ctx.role, "inventory:write")) redirect("/estoque/itens");

  const [categorias, marcas, locais, socios] = await Promise.all([
    listarCategorias(),
    listarMarcas(),
    listarLocais(),
    listarSocios(),
  ]);

  // As definições de spec vêm do banco, por categoria. É o que permite criar
  // categoria nova sem tocar em código.
  const categoriasComSpecs = await Promise.all(
    categorias.map(async (categoria) => ({
      id: categoria.id,
      name: categoria.name,
      slug: categoria.slug,
      icon: categoria.icon,
      specs: await definicoesDeSpec(categoria.id),
    })),
  );

  return (
    <div className="space-y-4">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Adicionar peça
        </h1>
        <p className="text-muted-foreground text-sm">
          As especificações ficam no modelo; o serial, o local e o valor ficam
          em cada unidade.
        </p>
      </div>

      <FormularioDeCadastro
        categorias={categoriasComSpecs}
        marcas={marcas}
        locais={locais}
        socios={socios.map((socio) => ({ id: socio.id, name: socio.name }))}
        leituraDeEtiquetaDisponivel={iaDisponivel()}
      />
    </div>
  );
}
