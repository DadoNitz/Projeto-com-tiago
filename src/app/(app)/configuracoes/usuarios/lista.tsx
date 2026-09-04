"use client";

import { KeyRound, Loader2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Role } from "@/generated/prisma/enums";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { formatarData, tempoRelativo } from "@/lib/format";
import {
  mudarPapel,
  mudarSituacao,
  novoUsuario,
  resetarSenha,
} from "@/server/actions/user.actions";
import { cn } from "@/lib/utils";

export interface UsuarioNaLista {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

const PAPEIS: Role[] = [Role.ADMIN, Role.EMPLOYEE, Role.VIEWER];

const DESCRICAO_DO_PAPEL: Record<Role, string> = {
  ADMIN: "Controle total, incluindo usuários e auditoria",
  EMPLOYEE: "Cadastra peças, movimenta estoque e monta",
  VIEWER: "Só consulta. Não altera nada",
};

/**
 * Gestão de usuários (seção 16).
 *
 * A senha inicial é definida por quem cria a conta e entregue pessoalmente.
 * Não há envio por e-mail: montar fluxo de e-mail transacional para uma
 * equipe de três pessoas seria mais superfície de falha que benefício.
 */
export function ListaDeUsuarios({
  usuarios,
  meuId,
}: {
  usuarios: UsuarioNaLista[];
  meuId: string;
}) {
  const router = useRouter();
  const [ocupado, iniciar] = useTransition();

  function executar(
    acao: () => Promise<{ ok: boolean; error?: string }>,
    sucesso: string,
  ) {
    iniciar(async () => {
      const resultado = await acao();
      if (!resultado.ok) {
        toast.error("Não foi possível", { description: resultado.error });
        return;
      }
      toast.success(sucesso);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {usuarios.filter((u) => u.active).length} conta(s) ativa(s).
        </p>
        <NovoUsuarioDialog />
      </div>

      <ul className="bg-card divide-y overflow-hidden rounded-lg border">
        {usuarios.map((usuario) => (
          <li key={usuario.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {usuario.name}
                  {usuario.id === meuId ? (
                    <span className="text-muted-foreground ml-2 text-xs">
                      (você)
                    </span>
                  ) : null}
                  {!usuario.active ? (
                    <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
                      desativada
                    </span>
                  ) : null}
                </p>
                <p className="text-muted-foreground text-sm">{usuario.email}</p>
                <p className="text-muted-foreground text-xs">
                  {usuario.lastLoginAt
                    ? `Último acesso ${tempoRelativo(usuario.lastLoginAt)}`
                    : "Nunca acessou"}
                  {" · criada em "}
                  {formatarData(usuario.createdAt)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={`Perfil de ${usuario.name}`}
                  className="border-input bg-background h-9 rounded-md border px-2 text-sm"
                  value={usuario.role}
                  disabled={ocupado}
                  onChange={(evento) =>
                    executar(
                      () =>
                        mudarPapel({
                          userId: usuario.id,
                          role: evento.target.value as Role,
                        }),
                      "Perfil alterado",
                    )
                  }
                >
                  {PAPEIS.map((papel) => (
                    <option key={papel} value={papel}>
                      {ROLE_LABELS[papel]}
                    </option>
                  ))}
                </select>

                <RedefinirSenhaDialog
                  userId={usuario.id}
                  nome={usuario.name}
                />

                <Button
                  variant={usuario.active ? "outline" : "default"}
                  size="sm"
                  className="h-9"
                  disabled={ocupado || usuario.id === meuId}
                  onClick={() =>
                    executar(
                      () =>
                        mudarSituacao({
                          userId: usuario.id,
                          active: !usuario.active,
                        }),
                      usuario.active ? "Conta desativada" : "Conta reativada",
                    )
                  }
                >
                  {usuario.active ? "Desativar" : "Reativar"}
                </Button>
              </div>
            </div>

            <p className="text-muted-foreground mt-1.5 text-xs">
              {DESCRICAO_DO_PAPEL[usuario.role]}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NovoUsuarioDialog() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [salvando, iniciar] = useTransition();
  const [dados, setDados] = useState({
    name: "",
    email: "",
    role: Role.EMPLOYEE as Role,
    senha: "",
  });

  function enviar() {
    iniciar(async () => {
      const resultado = await novoUsuario(dados);
      if (!resultado.ok) {
        toast.error("Não foi possível criar", { description: resultado.error });
        return;
      }
      toast.success("Conta criada", {
        description: `Entregue a senha para ${dados.name} pessoalmente.`,
      });
      setAberto(false);
      setDados({ name: "", email: "", role: Role.EMPLOYEE, senha: "" });
      router.refresh();
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button className="h-11" />}>
        <UserPlus className="size-4" aria-hidden />
        Nova conta
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova conta</DialogTitle>
          <DialogDescription>
            Defina uma senha e entregue à pessoa. Ela pode trocá-la depois em
            Configurações.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-4 pb-4">
          <div className="space-y-1.5">
            <Label htmlFor="u-nome">Nome</Label>
            <Input
              id="u-nome"
              className="h-11"
              value={dados.name}
              onChange={(e) => setDados((a) => ({ ...a, name: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="u-email">E-mail</Label>
            <Input
              id="u-email"
              type="email"
              autoCapitalize="none"
              spellCheck={false}
              className="h-11"
              value={dados.email}
              onChange={(e) => setDados((a) => ({ ...a, email: e.target.value }))}
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Perfil</legend>
            {PAPEIS.map((papel) => (
              <label
                key={papel}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-lg border p-3",
                  dados.role === papel ? "border-primary bg-primary/5" : "",
                )}
              >
                <input
                  type="radio"
                  name="perfil"
                  className="mt-1"
                  checked={dados.role === papel}
                  onChange={() => setDados((a) => ({ ...a, role: papel }))}
                />
                <span>
                  <span className="block text-sm font-medium">
                    {ROLE_LABELS[papel]}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {DESCRICAO_DO_PAPEL[papel]}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="u-senha">Senha inicial</Label>
            <Input
              id="u-senha"
              type="text"
              className="h-11 font-mono"
              value={dados.senha}
              onChange={(e) => setDados((a) => ({ ...a, senha: e.target.value }))}
            />
            <p className="text-muted-foreground text-xs">
              Mínimo de 10 caracteres. Fica visível para você poder anotá-la e
              entregar — ela não é enviada por e-mail.
            </p>
          </div>

          <Button
            className="h-11 w-full"
            onClick={enviar}
            disabled={
              salvando ||
              dados.name.trim().length < 2 ||
              !dados.email.includes("@") ||
              dados.senha.length < 10
            }
          >
            {salvando ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <UserPlus className="size-4" aria-hidden />
            )}
            Criar conta
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RedefinirSenhaDialog({
  userId,
  nome,
}: {
  userId: string;
  nome: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [novaSenha, setNovaSenha] = useState("");
  const [salvando, iniciar] = useTransition();

  function enviar() {
    iniciar(async () => {
      const resultado = await resetarSenha({ userId, novaSenha });
      if (!resultado.ok) {
        toast.error("Não foi possível", { description: resultado.error });
        return;
      }
      toast.success("Senha redefinida", {
        description: `Entregue a nova senha para ${nome}.`,
      });
      setAberto(false);
      setNovaSenha("");
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={<Button variant="outline" size="sm" className="h-9" />}
      >
        <KeyRound className="size-3.5" aria-hidden />
        Senha
      </DialogTrigger>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Redefinir senha de {nome}</DialogTitle>
          <DialogDescription>
            A senha antiga deixa de funcionar imediatamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-4 pb-4">
          <div className="space-y-1.5">
            <Label htmlFor={`reset-${userId}`}>Nova senha</Label>
            <Input
              id={`reset-${userId}`}
              type="text"
              className="h-11 font-mono"
              value={novaSenha}
              onChange={(evento) => setNovaSenha(evento.target.value)}
            />
          </div>

          <Button
            className="h-11 w-full"
            onClick={enviar}
            disabled={salvando || novaSenha.length < 10}
          >
            {salvando ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <KeyRound className="size-4" aria-hidden />
            )}
            Redefinir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
