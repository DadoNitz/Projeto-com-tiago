import "server-only";

import {
  chaveDaVerificacao,
  type VerificacaoManual,
} from "@/domain/compatibility/types";
import { prisma } from "@/server/db/client";
import type { ActionContext } from "@/server/session";

import { registrarAuditoria } from "./audit.service";
import { NaoEncontradoError, RegraDeNegocioError } from "./errors";

/**
 * Verificações manuais de compatibilidade.
 *
 * Grava que uma pessoa conferiu fisicamente algo que o sistema não tem como
 * saber — o caso concreto é a versão da BIOS de uma placa específica.
 *
 * O registro guarda **quem** verificou e **quando**. Uma exceção anônima seria
 * indistinguível de alguém tendo clicado em "ignorar" para se livrar do aviso.
 */

/**
 * Regras que admitem conferência humana.
 *
 * Lista fechada, e não "qualquer regra": o recurso existe para resolver
 * "o sistema não sabe", não para silenciar avisos. Uma regra que o motor
 * decide com certeza — socket, tipo de memória, comprimento de GPU — não entra
 * aqui, porque não há o que uma pessoa possa constatar que mude o fato.
 */
const REGRAS_VERIFICAVEIS = new Set(["bios-placa"]);

export async function registrarVerificacao(
  args: { ruleKey: string; unitId: string; reason: string },
  ctx: ActionContext,
): Promise<void> {
  if (!REGRAS_VERIFICAVEIS.has(args.ruleKey)) {
    throw new RegraDeNegocioError(
      "Esta verificação não pode ser resolvida manualmente.",
    );
  }

  const unidade = await prisma.inventoryUnit.findUnique({
    where: { id: args.unitId },
    select: { id: true, internalCode: true },
  });

  if (!unidade) throw new NaoEncontradoError("Unidade de estoque");

  await prisma.compatibilityOverride.create({
    data: {
      ruleKey: args.ruleKey,
      subjectType: "InventoryUnit",
      subjectId: args.unitId,
      level: "COMPATIBLE",
      reason: args.reason,
      verifiedById: ctx.userId,
    },
  });

  await registrarAuditoria(
    {
      action: "update",
      entity: "InventoryUnit",
      entityId: args.unitId,
      after: { verificacao: args.ruleKey, motivo: args.reason },
    },
    ctx,
  );
}

/** Remove a verificação — usado quando a peça é reavaliada ou a BIOS regride. */
export async function removerVerificacao(
  args: { ruleKey: string; unitId: string },
  ctx: ActionContext,
): Promise<void> {
  await prisma.compatibilityOverride.deleteMany({
    where: { ruleKey: args.ruleKey, subjectId: args.unitId },
  });

  await registrarAuditoria(
    {
      action: "update",
      entity: "InventoryUnit",
      entityId: args.unitId,
      after: { verificacaoRemovida: args.ruleKey },
    },
    ctx,
  );
}

/**
 * Carrega todas as verificações em um mapa, pronto para o motor.
 *
 * Uma consulta só: o motor roda para várias montagens na mesma página, e
 * buscar por peça faria dezenas de idas ao banco.
 */
export async function carregarVerificacoes(): Promise<
  Map<string, VerificacaoManual>
> {
  const registros = await prisma.compatibilityOverride.findMany({
    where: { subjectType: "InventoryUnit" },
    orderBy: { verifiedAt: "desc" },
    select: {
      ruleKey: true,
      subjectId: true,
      reason: true,
      verifiedAt: true,
      verifiedBy: { select: { name: true } },
    },
  });

  const mapa = new Map<string, VerificacaoManual>();

  for (const registro of registros) {
    const chave = chaveDaVerificacao(registro.ruleKey, registro.subjectId);
    // `orderBy` decrescente + primeira ocorrência vence: se a mesma peça foi
    // verificada duas vezes, vale a conferência mais recente.
    if (mapa.has(chave)) continue;

    mapa.set(chave, {
      ruleKey: registro.ruleKey,
      subjectId: registro.subjectId,
      reason: registro.reason,
      verificadoPor: registro.verifiedBy?.name ?? undefined,
      verificadoEm: registro.verifiedAt,
    });
  }

  return mapa;
}
