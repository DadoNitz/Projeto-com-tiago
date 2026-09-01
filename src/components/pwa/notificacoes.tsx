"use client";

import { Bell, BellOff, Loader2 } from "lucide-react";
import { useCallback, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * Ativação de notificações push (seção 33).
 *
 * Três decisões que definem o comportamento:
 *
 * 1. **A permissão só é pedida quando a pessoa clica.** Pedir na abertura da
 *    página é o caminho mais curto para o "Bloquear" — e uma vez bloqueado,
 *    não há como pedir de novo. O botão explica antes o que vai chegar.
 * 2. **Bloqueado não vira insistência.** Se a permissão foi negada, o
 *    componente mostra como reverter e cala a boca.
 * 3. **Cancelar remove a inscrição no servidor**, não só localmente: senão o
 *    servidor seguiria tentando enviar para um endpoint que ninguém lê.
 */

type Suporte = "sim" | "nao";

function suportaPush(): Suporte {
  const temTudo =
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  return temTudo ? "sim" : "nao";
}

export function AtivarNotificacoes({ chavePublica }: { chavePublica: string }) {
  // Capacidade do navegador, não estado que muda: store externo evita
  // `setState` em efeito e a cascata de renderização que ele causa.
  const suporte = useSyncExternalStore(
    () => () => {},
    suportaPush,
    () => "nao" as Suporte,
  );

  const permissao = useSyncExternalStore(
    () => () => {},
    () => (typeof Notification !== "undefined" ? Notification.permission : "default"),
    () => "default" as NotificationPermission,
  );

  const [inscrito, setInscrito] = useState<boolean | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Descobre o estado atual da inscrição na primeira renderização no cliente.
  const estadoInicial = useSyncExternalStore(
    () => () => {},
    () => (suporte === "sim" ? "verificar" : "sem-suporte"),
    () => "sem-suporte",
  );

  const ativar = useCallback(async () => {
    setOcupado(true);

    try {
      const autorizacao = await Notification.requestPermission();

      if (autorizacao !== "granted") {
        toast.info("Notificações não ativadas", {
          description:
            "Você pode liberar depois nas permissões do site, no navegador.",
        });
        return;
      }

      const registro = await navigator.serviceWorker.ready;
      const inscricao = await registro.pushManager.subscribe({
        // Obrigatório nos navegadores atuais: só notificação visível é
        // permitida. Push silencioso foi abusado para rastreamento.
        userVisibleOnly: true,
        applicationServerKey: chavePublica,
      });

      const resposta = await fetch("/api/push/inscrever", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(inscricao.toJSON()),
      });

      if (!resposta.ok) {
        const dados: { erro?: string } = await resposta.json();
        toast.error("Não foi possível ativar", { description: dados.erro });
        await inscricao.unsubscribe();
        return;
      }

      setInscrito(true);
      toast.success("Notificações ativadas", {
        description:
          "Você será avisado sobre estoque baixo, peças com defeito e reservas paradas.",
      });
    } catch (erro) {
      toast.error("Falha ao ativar", {
        description: erro instanceof Error ? erro.message : undefined,
      });
    } finally {
      setOcupado(false);
    }
  }, [chavePublica]);

  const desativar = useCallback(async () => {
    setOcupado(true);

    try {
      const registro = await navigator.serviceWorker.ready;
      const inscricao = await registro.pushManager.getSubscription();

      if (inscricao) {
        // Remove no servidor ANTES de cancelar localmente: se cancelasse
        // primeiro e a rede caísse, o servidor seguiria enviando para um
        // endpoint morto.
        await fetch("/api/push/inscrever", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: inscricao.endpoint }),
        });
        await inscricao.unsubscribe();
      }

      setInscrito(false);
      toast.success("Notificações desativadas");
    } finally {
      setOcupado(false);
    }
  }, []);

  if (estadoInicial === "sem-suporte") {
    return (
      <p className="text-muted-foreground text-sm">
        Este navegador não suporta notificações. No iPhone, é preciso instalar
        o aplicativo na tela inicial primeiro.
      </p>
    );
  }

  if (permissao === "denied") {
    return (
      <p className="text-muted-foreground text-sm">
        As notificações estão bloqueadas para este site. Para liberar, abra as
        permissões do site nas configurações do navegador — o sistema não
        consegue pedir de novo depois de um bloqueio.
      </p>
    );
  }

  const ativo = inscrito ?? permissao === "granted";

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-sm">
        Avisos de estoque baixo, peças com defeito e reservas paradas há mais de
        15 dias. Uma verificação por dia.
      </p>

      <Button
        variant={ativo ? "outline" : "default"}
        className="h-11"
        onClick={() => void (ativo ? desativar() : ativar())}
        disabled={ocupado}
      >
        {ocupado ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : ativo ? (
          <BellOff className="size-4" aria-hidden />
        ) : (
          <Bell className="size-4" aria-hidden />
        )}
        {ativo ? "Desativar notificações" : "Ativar notificações"}
      </Button>
    </div>
  );
}
