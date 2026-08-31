import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { lerQrCode } from "@/domain/inventory/serial";
import { buscarUnidadePorCodigo } from "@/server/services/inventory.service";

import { LeitorDeCodigo } from "./leitor";

export const metadata: Metadata = { title: "Ler código" };
export const dynamic = "force-dynamic";

/**
 * Leitura de QR Code / código interno pela câmera.
 *
 * Quando o parâmetro `codigo` chega preenchido, a página resolve e redireciona
 * direto para a unidade. É o que faz "apontar a câmera para a peça" terminar
 * na tela certa, que é o objetivo da seção 33.
 */
export default async function LerCodigoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const bruto = typeof params.codigo === "string" ? params.codigo : undefined;

  if (bruto) {
    const codigoInterno = lerQrCode(bruto);

    if (codigoInterno) {
      const unidade = await buscarUnidadePorCodigo(codigoInterno);
      if (unidade) redirect(`/estoque/itens/${unidade.id}`);
    }

    return (
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">Código não encontrado</h1>
        <p className="text-muted-foreground text-sm">
          Não existe peça com o código <strong>{bruto}</strong>. Confira se a
          etiqueta é deste sistema ou digite o código manualmente.
        </p>
        <LeitorDeCodigo />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Ler código da peça
        </h1>
        <p className="text-muted-foreground text-sm">
          Aponte a câmera para o QR Code da etiqueta, ou digite o código
          interno.
        </p>
      </div>

      <LeitorDeCodigo />
    </div>
  );
}
