import { getSessionUser, UNAUTHORIZED, FORBIDDEN, isManager } from "@/lib/auth";
import { generateWeeklyAlert, type WeeklyRankingRow } from "@/lib/weekly-alerts";

/**
 * POST /api/alerts/weekly — regenera y reenvía la alerta semanal ahora.
 * Solo dirección (ADMIN / SALES_DIRECTOR). Útil como botón "Enviar ahora"
 * y para probar la alerta sin esperar al lunes siguiente.
 */
export async function POST() {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();
  if (!isManager(me.role)) return FORBIDDEN();

  const result = await generateWeeklyAlert({ force: true });
  if (!result) {
    return Response.json({ error: "No se pudo generar la alerta" }, { status: 500 });
  }

  return Response.json({
    ok: true,
    recipients: result.recipients,
    weekStart: result.weekStart.toISOString(),
    weekEnd: result.weekEnd.toISOString(),
    ranking: result.ranking as WeeklyRankingRow[],
  });
}
