import "server-only";

import QRCode from "qrcode";

import { conteudoQrCode } from "@/domain/inventory/serial";
import { prisma } from "@/server/db/client";

/**
 * Etiquetas imprimiveis com QR Code (secao 33).
 *
 * O QR guarda o CODIGO INTERNO, nao uma URL. E deliberado: etiqueta colada em
 * peca nao se reimprime quando o dominio muda, e um QR com URL viraria lixo no
 * dia em que o endereco do sistema mudasse. O leitor do proprio sistema
 * interpreta o codigo e navega.
 *
 * O SVG e gerado no servidor: gerar no navegador exigiria carregar a
 * biblioteca de QR no cliente para uma tela usada de vez em quando.
 */

export interface EtiquetaParaImpressao {
  unitId: string;
  codigoInterno: string;
  nomeCurto: string;
  serialFinal: string | null;
  qrSvg: string;
}

/** Nome curto o bastante para caber na etiqueta sem quebrar. */
function encurtar(nome: string, limite = 34): string {
  const limpo = nome.trim();
  return limpo.length <= limite ? limpo : `${limpo.slice(0, limite - 1)}…`;
}

export async function montarEtiquetas(
  unitIds: string[],
): Promise<EtiquetaParaImpressao[]> {
  if (unitIds.length === 0) return [];

  const unidades = await prisma.inventoryUnit.findMany({
    where: { id: { in: unitIds.slice(0, 100) } },
    select: {
      id: true,
      internalCode: true,
      serialLast: true,
      product: {
        select: { name: true, brand: { select: { name: true } } },
      },
    },
  });

  return Promise.all(
    unidades.map(async (unidade) => {
      const marca = unidade.product.brand?.name;
      const nome = marca
        ? `${marca} ${unidade.product.name}`
        : unidade.product.name;

      const qrSvg = await QRCode.toString(
        conteudoQrCode(unidade.internalCode),
        {
          type: "svg",
          margin: 0,
          // Correcao alta: etiqueta em peca de informatica pega poeira, cola e
          // arranhao. Com correcao baixa, um risco no QR o torna ilegivel.
          errorCorrectionLevel: "H",
          width: 120,
        },
      );

      return {
        unitId: unidade.id,
        codigoInterno: unidade.internalCode,
        nomeCurto: encurtar(nome),
        serialFinal: unidade.serialLast,
        qrSvg,
      };
    }),
  );
}

/** Unidades candidatas a etiqueta: as que estao fisicamente no estoque. */
export async function unidadesParaEtiquetar(limite = 200) {
  return prisma.inventoryUnit.findMany({
    where: { status: { in: ["AVAILABLE", "RESERVED", "IN_BUILD", "DEFECTIVE"] } },
    orderBy: { createdAt: "desc" },
    take: limite,
    select: {
      id: true,
      internalCode: true,
      serialLast: true,
      product: {
        select: {
          name: true,
          brand: { select: { name: true } },
          category: { select: { name: true } },
        },
      },
    },
  });
}
