import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  rotuloDaCategoria,
  type Segmento,
} from "@/domain/promotions/categorias";
import { iaDisponivel } from "@/lib/ai";
import { can } from "@/lib/auth/permissions";
import {
  contarPromocoesPorSegmento,
  listarPromocoes,
} from "@/server/services/promotion.service";
import { telegramConfigurado } from "@/server/services/telegram.service";
import { requireContext } from "@/server/session";

import { PainelDePromocoes } from "./painel";

export const metadata: Metadata = { title: "Promoções" };
export const dynamic = "force-dynamic";

/**
 * Promoções (seção 15).
 *
 * Duas entradas: cadastro manual, e coleta das ofertas encaminhadas para um
 * grupo de Telegram seu. Nenhuma raspagem de site — a especificação pede
 * isso, e com razão: raspador quebra a cada mudança de layout e costuma
 * violar termos de uso. A API do Telegram é oficial e feita para isto.
 *
 * O valor da tela não está em achar a oferta, e sim em julgá-la. E aqui o
 * sistema tem um parâmetro que nenhum site de promoção tem: quanto você já
 * pagou naquela peça.
 *
 * A lista abre em "Peças de PC" de propósito. Os canais mandam eletrônico
 * junto — controle, TV, projetor — e isso interessa, mas não é o trabalho:
 * quem revende monta PC. O eletrônico fica a um clique, sem diluir a lista
 * que se olha todo dia.
 */
const SEGMENTOS = ["pc", "eletronico", "tudo"] as const;

function segmentoPedido(valor: string | undefined): Segmento | "tudo" {
  return SEGMENTOS.includes(valor as (typeof SEGMENTOS)[number])
    ? (valor as Segmento | "tudo")
    : "pc";
}

export default async function PromocoesPage({
  searchParams,
}: {
  searchParams: Promise<{ segmento?: string }>;
}) {
  const ctx = await requireContext();
  if (!can(ctx.role, "inventory:read")) redirect("/dashboard");

  const segmento = segmentoPedido((await searchParams).segmento);

  const [promocoes, contagens] = await Promise.all([
    listarPromocoes(true, segmento),
    contarPromocoesPorSegmento(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Promoções
        </h1>
        <p className="text-muted-foreground text-sm">
          Encaminhe ofertas para o grupo do bot, ou registre à mão. O sistema
          compara com o que você já pagou naquela peça — que é o único
          parâmetro que importa para revender.
        </p>
      </div>

      <PainelDePromocoes
        segmento={segmento}
        contagens={contagens}
        podeAvaliar={can(ctx.role, "ai:use") && iaDisponivel()}
        podeColetar={
          can(ctx.role, "ai:use") && iaDisponivel() && telegramConfigurado()
        }
        promocoes={promocoes.map((promocao) => ({
          id: promocao.id,
          titulo: promocao.title,
          categoria: rotuloDaCategoria(promocao.categorySlug),
          loja: promocao.store?.name ?? null,
          precoAtual: Number(promocao.currentPrice),
          precoNormal: promocao.regularPrice
            ? Number(promocao.regularPrice)
            : null,
          desconto: promocao.discountPct ? Number(promocao.discountPct) : null,
          frete: promocao.shippingCost ? Number(promocao.shippingCost) : null,
          cashback: promocao.cashbackPct ? Number(promocao.cashbackPct) : null,
          cupom: promocao.coupon,
          url: promocao.url,
          urlApp: promocao.appUrl,
          nota: promocao.aiScore,
          veredito: promocao.aiVerdict,
          vistaEm: promocao.seenAt,
        }))}
      />
    </div>
  );
}
