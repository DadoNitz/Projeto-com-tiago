import { ScrollText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { formatarDataHora, tempoRelativo } from "@/lib/format";
import { can } from "@/lib/auth/permissions";
import {
  camposAlterados,
  listarTrilha,
  opcoesDaTrilha,
} from "@/server/services/audit-read.service";
import { requireContext } from "@/server/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Auditoria" };
export const dynamic = "force-dynamic";

/** Rótulos das ações. O banco guarda o termo técnico; a tela mostra português. */
const ROTULO_ACAO: Record<string, string> = {
  create: "Cadastrou",
  update: "Alterou",
  delete: "Excluiu",
  restore: "Restaurou",
  movement: "Movimentou",
  login: "Entrou no sistema",
};

const ROTULO_ENTIDADE: Record<string, string> = {
  Product: "Modelo de peça",
  InventoryUnit: "Peça",
  InventoryMovement: "Movimentação",
  Build: "Montagem",
  Partner: "Sócio",
  Brand: "Marca",
  Location: "Local",
  Listing: "Anúncio",
  Promotion: "Promoção",
  User: "Usuário",
};

const COR_ACAO: Record<string, string> = {
  create: "bg-emerald-500",
  update: "bg-sky-500",
  delete: "bg-red-500",
  movement: "bg-amber-500",
  restore: "bg-violet-500",
  login: "bg-neutral-400",
};

type SearchParams = Record<string, string | string[] | undefined>;

function primeiro(valor: string | string[] | undefined): string | undefined {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  return texto && texto.length > 0 ? texto : undefined;
}

/**
 * Trilha de auditoria (seção 17).
 *
 * Só o administrador enxerga. A trilha mostra quem alterou o quê e quando, e
 * responde a pergunta que aparece quando um número não bate: "esse valor
 * mudou sozinho?".
 *
 * É somente leitura. Não há botão de apagar nem de editar, e isso é
 * deliberado — uma trilha que pode ser alterada não serve para nada.
 */
export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requireContext();
  if (!can(ctx.role, "audit:read")) redirect("/dashboard");

  const params = await searchParams;

  const filtro = {
    entity: primeiro(params.entity),
    action: primeiro(params.action),
    userId: primeiro(params.userId),
    entityId: primeiro(params.entityId),
    cursor: primeiro(params.cursor),
  };

  const [pagina, opcoes] = await Promise.all([
    listarTrilha(filtro),
    opcoesDaTrilha(),
  ]);

  const temFiltro = Boolean(
    filtro.entity || filtro.action || filtro.userId || filtro.entityId,
  );

  function comFiltro(mudancas: Record<string, string | undefined>): string {
    const busca = new URLSearchParams();
    const combinado = { ...filtro, cursor: undefined, ...mudancas };
    for (const [chave, valor] of Object.entries(combinado)) {
      if (valor) busca.set(chave, valor);
    }
    const texto = busca.toString();
    return texto ? `/auditoria?${texto}` : "/auditoria";
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Auditoria
        </h1>
        <p className="text-muted-foreground text-sm">
          Quem alterou o quê e quando. Somente leitura — nem o administrador
          apaga um registro daqui.
        </p>
      </div>

      <section className="bg-card space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs">Ação:</span>
          <Filtro href={comFiltro({ action: undefined })} ativo={!filtro.action}>
            Todas
          </Filtro>
          {opcoes.acoes.map((acao) => (
            <Filtro
              key={acao}
              href={comFiltro({ action: acao })}
              ativo={filtro.action === acao}
            >
              {ROTULO_ACAO[acao] ?? acao}
            </Filtro>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs">Registro:</span>
          <Filtro href={comFiltro({ entity: undefined })} ativo={!filtro.entity}>
            Todos
          </Filtro>
          {opcoes.entidades.map((entidade) => (
            <Filtro
              key={entidade}
              href={comFiltro({ entity: entidade })}
              ativo={filtro.entity === entidade}
            >
              {ROTULO_ENTIDADE[entidade] ?? entidade}
            </Filtro>
          ))}
        </div>

        {opcoes.usuarios.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-xs">Quem:</span>
            <Filtro href={comFiltro({ userId: undefined })} ativo={!filtro.userId}>
              Qualquer um
            </Filtro>
            {opcoes.usuarios.map((usuario) => (
              <Filtro
                key={usuario.id}
                href={comFiltro({ userId: usuario.id })}
                ativo={filtro.userId === usuario.id}
              >
                {usuario.name}
              </Filtro>
            ))}
          </div>
        ) : null}

        {temFiltro ? (
          <Link href="/auditoria" className="text-muted-foreground text-xs underline">
            Limpar filtros
          </Link>
        ) : null}
      </section>

      {pagina.eventos.length === 0 ? (
        <div className="bg-card flex flex-col items-center gap-2 rounded-lg border px-6 py-16 text-center">
          <ScrollText className="text-muted-foreground size-9" aria-hidden />
          <p className="font-medium">Nenhum registro encontrado</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            {temFiltro
              ? "Nenhum evento bate com os filtros escolhidos."
              : "A trilha começa a registrar no primeiro cadastro ou movimentação."}
          </p>
        </div>
      ) : (
        <ol className="bg-card divide-y overflow-hidden rounded-lg border">
          {pagina.eventos.map((evento) => {
            const mudancas =
              evento.action === "update"
                ? camposAlterados(evento.before, evento.after)
                : [];

            return (
              <li key={evento.id} className="flex gap-3 p-4">
                <span
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    COR_ACAO[evento.action] ?? "bg-neutral-400",
                  )}
                  aria-hidden
                />

                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <strong>{evento.user?.name ?? "Sistema"}</strong>{" "}
                    {(ROTULO_ACAO[evento.action] ?? evento.action).toLowerCase()}{" "}
                    <span className="text-muted-foreground">
                      {(ROTULO_ENTIDADE[evento.entity] ?? evento.entity).toLowerCase()}
                    </span>
                  </p>

                  <p className="text-muted-foreground text-xs">
                    <time dateTime={evento.createdAt.toISOString()}>
                      {formatarDataHora(evento.createdAt)}
                    </time>{" "}
                    · {tempoRelativo(evento.createdAt)}
                    {evento.ip ? ` · ${evento.ip}` : ""}
                  </p>

                  {mudancas.length > 0 ? (
                    <ul className="mt-2 space-y-0.5 text-xs">
                      {mudancas.map((mudanca) => (
                        <li key={mudanca.campo} className="flex flex-wrap gap-1">
                          <span className="text-muted-foreground">
                            {mudanca.campo}:
                          </span>
                          <span className="text-muted-foreground line-through">
                            {mudanca.de}
                          </span>
                          <span aria-hidden>→</span>
                          <span className="font-medium">{mudanca.para}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {evento.entity === "InventoryUnit" ||
                  evento.entity === "Product" ? (
                    <Link
                      href={comFiltro({
                        entityId: evento.entityId,
                        entity: undefined,
                        action: undefined,
                      })}
                      className="text-muted-foreground mt-1 inline-block text-xs underline"
                    >
                      Ver só o histórico deste registro
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {pagina.proximoCursor ? (
        <div className="flex justify-center">
          <Link
            href={comFiltro({ cursor: pagina.proximoCursor })}
            className="hover:bg-muted inline-flex h-11 items-center rounded-lg border px-4 text-sm"
          >
            Carregar mais
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function Filtro({
  href,
  ativo,
  children,
}: {
  href: string;
  ativo: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs transition-colors",
        ativo ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted",
      )}
    >
      {children}
    </Link>
  );
}
