import { exportarEstoqueCsv } from "@/server/services/report.service";
import { requirePermission } from "@/server/session";

/**
 * Exportacao do estoque em CSV.
 *
 * Rota HTTP em vez de Server Action porque o resultado e um DOWNLOAD: o
 * navegador precisa dos cabecalhos Content-Disposition e Content-Type, que so
 * uma resposta HTTP entrega.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  await requirePermission("report:read");

  const csv = await exportarEstoqueCsv();
  const data = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      // charset=utf-8 junto com o BOM que o servico escreve: e o par que faz
      // o Excel em portugues abrir com acentos corretos.
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="estoque-${data}.csv"`,
      // Relatorio e sempre do momento: cache aqui entregaria numeros velhos.
      "cache-control": "no-store",
    },
  });
}
