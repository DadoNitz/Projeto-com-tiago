import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { iaDisponivel } from "@/lib/ai";
import { can } from "@/lib/auth/permissions";
import { listarPromocoes } from "@/server/services/promotion.service";
import { requireContext } from "@/server/session";

import { PainelDePromocoes } from "./painel";

export const metadata: Metadata = { title: "Promoções" };
export const dynamic = "force-dynamic";

/**
 * Promoções (seção 15).
 *
 * Cadastro manual, sem raspagem de sites — a especificação pede isso, e com
 * razão: raspador quebra a cada mudança de layout e costuma violar termos de
 * uso.
 *
 * O valor da tela não está em achar a oferta, e sim em julgá-la. E aqui o
 * sistema tem um parâmetro que nenhum site de promoção tem: quanto você já
 * pagou naquela peça.
 */
export default async function PromocoesPage() {
  const ctx = await requireContext();
  if (!can(ctx.role, "inventory:read")) redirect("/dashboard");

  const promocoes = await listarPromocoes();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Promoções
        </h1>
        <p className="text-muted-foreground text-sm">
          Registre uma oferta e o sistema compara com o que você já pagou
          naquela peça — que é o único parâmetro que importa para revender.
        </p>
      </div>

      <PainelDePromocoes
        podeAvaliar={can(ctx.role, "ai:use") && iaDisponivel()}
        promocoes={promocoes.map((promocao) => ({
          id: promocao.id,
          titulo: promocao.title,
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
          nota: promocao.aiScore,
          veredito: promocao.aiVerdict,
          vistaEm: promocao.seenAt,
        }))}
      />
    </div>
  );
}
