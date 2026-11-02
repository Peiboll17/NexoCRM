import { db } from "@/lib/db";

// ============================================================
// Alerta automática semanal con el ranking del equipo
// ------------------------------------------------------------
// - Se ejecuta la primera vez que alguien abre el CRM cada semana
//   (patrón "cron perezoso" — lazy cron sobre peticiones entrantes).
// - Cada semana ISO (lunes) se envía 1 única alerta: la clave única
//   AlertLog.weekStart actúa como cerrojo atómico anti-duplicados.
// - El contenido es el ranking de la SEMANA ANTERIOR (lun–dom).
// - La dirección puede regenerarla manualmente ("enviar ahora").
// ============================================================

export type WeeklyRankingRow = {
  userId: string;
  name: string;
  role: string;
  wonValue: number;
  wonCount: number;
  lostCount: number;
  activitiesCount: number;
  weeklyTarget: number | null; // cuota mensual prorrateada a 7 días
  compliance: number | null; // % cumplimiento semanal
};

export type WeeklyAlertPayload = {
  weekStart: string; // lunes de la semana reportada (ISO)
  weekEnd: string; // lunes siguiente (fin exclusivo, ISO)
  ranking: WeeklyRankingRow[];
  teamWonValue: number;
};

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

/** Lunes 00:00 de la semana de la fecha dada. */
export function mondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = domingo
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const fmtRange = (start: Date, end: Date) =>
  `${start.getDate()} ${start.toLocaleDateString("es-ES", { month: "short" })} – ${addDays(end, -1).getDate()} ${addDays(end, -1).toLocaleDateString("es-ES", { month: "short" })}`;

/** Ranking semanal: negocio ganado/perdido + actividades por usuario. */
async function computeWeeklyRanking(weekStart: Date, weekEnd: Date): Promise<WeeklyRankingRow[]> {
  const [users, won, lost, acts] = await Promise.all([
    db.user.findMany({ select: { id: true, name: true, role: true, quota: true } }),
    db.deal.findMany({
      where: { status: "WON", closedAt: { gte: weekStart, lt: weekEnd } },
      select: { ownerId: true, amount: true },
    }),
    db.deal.findMany({
      where: { status: "LOST", closedAt: { gte: weekStart, lt: weekEnd } },
      select: { ownerId: true },
    }),
    db.activity.findMany({
      where: { occurredAt: { gte: weekStart, lt: weekEnd }, userId: { not: null } },
      select: { userId: true },
    }),
  ]);

  const wonBy = new Map<string, { value: number; count: number }>();
  for (const d of won) {
    if (!d.ownerId) continue;
    const cur = wonBy.get(d.ownerId) ?? { value: 0, count: 0 };
    cur.value += d.amount;
    cur.count += 1;
    wonBy.set(d.ownerId, cur);
  }
  const lostBy = new Map<string, number>();
  for (const d of lost) {
    if (!d.ownerId) continue;
    lostBy.set(d.ownerId, (lostBy.get(d.ownerId) ?? 0) + 1);
  }
  const actsBy = new Map<string, number>();
  for (const a of acts) {
    if (!a.userId) continue;
    actsBy.set(a.userId, (actsBy.get(a.userId) ?? 0) + 1);
  }

  // Objetivo semanal = cuota mensual × 7 / días del mes de la semana reportada
  const daysInMonth = new Date(weekStart.getFullYear(), weekStart.getMonth() + 1, 0).getDate();

  return users
    .map((u) => {
      const w = wonBy.get(u.id) ?? { value: 0, count: 0 };
      const weeklyTarget =
        u.quota && u.quota > 0 ? Math.round((u.quota * 7) / daysInMonth) : null;
      return {
        userId: u.id,
        name: u.name,
        role: u.role,
        wonValue: Math.round(w.value),
        wonCount: w.count,
        lostCount: lostBy.get(u.id) ?? 0,
        activitiesCount: actsBy.get(u.id) ?? 0,
        weeklyTarget,
        compliance: weeklyTarget ? Math.round((w.value / weeklyTarget) * 100) : null,
      };
    })
    .sort((a, b) => b.wonValue - a.wonValue || b.activitiesCount - a.activitiesCount);
}

function buildTexts(payload: WeeklyAlertPayload): { title: string; body: string } {
  const start = new Date(payload.weekStart);
  const end = new Date(payload.weekEnd);
  const range = fmtRange(start, end);

  const podium = payload.ranking
    .filter((r) => r.wonValue > 0)
    .slice(0, 3)
    .map((r, i) => `${i + 1}º ${r.name} (${EUR.format(r.wonValue)})`)
    .join(" · ");

  const leader = payload.ranking[0];
  const complianceTxt =
    leader?.weeklyTarget && leader.wonValue > 0
      ? ` — ${leader.compliance}% de su objetivo semanal`
      : "";

  const title = `Ranking semanal del equipo · ${range}`;
  const body =
    payload.teamWonValue > 0
      ? `Resultado de la semana ${range}: ${EUR.format(payload.teamWonValue)} cerrados como ganados.\n${podium}\nLidera ${leader?.name ?? "—"}${complianceTxt}.`
      : `Resultado de la semana ${range}: sin negocios ganados todavía. ¡Ánimo, esta semana toca remontar!`;

  return { title, body };
}

/**
 * Genera (o regenera) la alerta semanal y la entrega a todos los usuarios.
 * `force` la regenera aunque ya exista (limpia las notificaciones de esa semana).
 */
export async function generateWeeklyAlert(params?: { now?: Date; force?: boolean }): Promise<{
  weekStart: Date;
  weekEnd: Date;
  ranking: WeeklyRankingRow[];
  recipients: number;
} | null> {
  const now = params?.now ?? new Date();
  // Cerrojo: lunes de la semana EN CURSO (1 alerta por semana calendario)
  const lockWeek = mondayOf(now);
  // Contenido: la semana completada anterior (lun–dom)
  const weekStart = addDays(lockWeek, -7);
  const weekEnd = lockWeek;

  const ranking = await computeWeeklyRanking(weekStart, weekEnd);
  const teamWonValue = ranking.reduce((s, r) => s + r.wonValue, 0);

  const payload: WeeklyAlertPayload = {
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    ranking,
    teamWonValue,
  };
  const { title, body } = buildTexts(payload);

  if (params?.force) {
    // Reenvío manual: borra el log y las notificaciones de esta semana y vuelve a crearlas
    await db.alertLog.deleteMany({ where: { weekStart: lockWeek } });
    const stale = await db.notification.findMany({
      where: { type: "WEEKLY_RANKING" },
      select: { id: true, payload: true },
    });
    const staleIds = stale
      .filter((n) => {
        try {
          const p = JSON.parse(n.payload) as { weekStart?: string };
          return p.weekStart === payload.weekStart;
        } catch {
          return false;
        }
      })
      .map((n) => n.id);
    if (staleIds.length > 0) {
      await db.notification.deleteMany({ where: { id: { in: staleIds } } });
    }
  }

  try {
    // Cerrojo atómico: la clave única weekStart evita duplicados concurrentes
    await db.alertLog.create({
      data: { weekStart: lockWeek, kind: "WEEKLY_RANKING", payload: JSON.stringify(payload) },
    });
  } catch {
    if (!params?.force) return null; // otra petición ya generó la alerta de esta semana
    return null;
  }

  const users = await db.user.findMany({ select: { id: true } });
  await db.notification.createMany({
    data: users.map((u) => ({
      userId: u.id,
      type: "WEEKLY_RANKING",
      title,
      body,
      payload: JSON.stringify(payload),
    })),
  });

  return { weekStart, weekEnd, ranking, recipients: users.length };
}

/**
 * Comprobación perezosa: si esta semana aún no se ha enviado la alerta,
 * la genera al vuelo. La llama el GET /api/alerts al abrir el CRM.
 */
export async function ensureWeeklyAlert(): Promise<boolean> {
  const lockWeek = mondayOf(new Date());
  const existing = await db.alertLog.findUnique({ where: { weekStart: lockWeek } });
  if (existing) return false;
  const created = await generateWeeklyAlert();
  return created !== null;
}
