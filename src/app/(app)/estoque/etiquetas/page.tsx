import { QrCode } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { can } from "@/lib/auth/permissions";
import {
  montarEtiquetas,
  unidadesParaEtiquetar,
} from "@/server/services/label-print.service";
import { requireContext } from "@/server/session";

import { SeletorDeEtiquetas } from "./seletor";

export const metadata: Metadata = { title: "Etiquetas" };
export const dynamic = "force-dynamic";

/**
 * Geração de etiquetas com QR Code.
 *
 * O QR guarda o código interno (INV-EST-00431), não uma URL. Etiqueta colada
 * em peça não se reimprime quando o endereço do sistema muda — um QR com URL
 * viraria lixo nesse dia.
 */
export default async function EtiquetasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireContext();
  if (!can(ctx.role, "inventory:write")) redirect("/estoque/itens");

  const params = await searchParams;
  const selecionados = params.unidade
    ? [params.unidade].flat().filter((valor): valor is string => Boolean(valor))
    : [];

  const [unidades, etiquetas] = await Promise.all([
    unidadesParaEtiquetar(),
    montarEtiquetas(selecionados),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="print:hidden">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
          <QrCode className="size-5" aria-hidden />
          Etiquetas
        </h1>
        <p className="text-muted-foreground text-sm">
          Selecione as peças, gere e imprima. O QR Code leva direto à página da
          unidade quando lido pelo sistema.
        </p>
      </div>

      <SeletorDeEtiquetas
        unidades={unidades.map((unidade) => ({
          id: unidade.id,
          codigo: unidade.internalCode,
          nome: unidade.product.brand
            ? `${unidade.product.brand.name} ${unidade.product.name}`
            : unidade.product.name,
          categoria: unidade.product.category.name,
        }))}
        selecionados={selecionados}
      />

      {etiquetas.length > 0 ? (
        <>
          <p className="text-muted-foreground text-sm print:hidden">
            {etiquetas.length} etiqueta(s). Use Ctrl+P para imprimir — o resto
            da tela não sai no papel.
          </p>

          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 print:grid-cols-3 print:gap-1">
            {etiquetas.map((etiqueta) => (
              <li
                key={etiqueta.unitId}
                className="flex items-center gap-2 rounded border border-neutral-400 bg-white p-2 text-black print:break-inside-avoid"
              >
                <div
                  className="size-[70px] shrink-0"
                  // O SVG vem do gerador de QR do servidor, não de entrada de
                  // usuário: não há caminho para injeção aqui.
                  dangerouslySetInnerHTML={{ __html: etiqueta.qrSvg }}
                />
                <div className="min-w-0 text-[10px] leading-tight">
                  <p className="truncate font-semibold">{etiqueta.nomeCurto}</p>
                  <p className="font-mono">{etiqueta.codigoInterno}</p>
                  {etiqueta.serialFinal ? (
                    <p className="font-mono">
                      Serial: ••••{etiqueta.serialFinal}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
