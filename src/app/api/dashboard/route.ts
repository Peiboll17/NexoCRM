import { db } from "@/lib/db";
import { getSessionUser, UNAUTHORIZED } from "@/lib/auth";
import { activityInclude, taskInclude } from "@/lib/includes";

/**
 * KPIs del dashboard con métricas en tiempo real del embudo:
 *  - Previsión ponderada = Σ (monto × probabilidad de la etapa)
 *  - Ganado/perdido del mes, tasa de conversión
 *  - Tareas vencidas, feed omnicanal reciente
 */
export async function GET() {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();

  const ownerFilter = me.role === "SALES_REP" ? { ownerId: me.id } : {};
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [stages, deals, tasks, recentActivities, newContactsThisMonth, meRecord, teamUsers] = await Promise.all([
    db.stage.findMany({ orderBy: { order: "asc" } }),
    db.deal.findMany({
      where: ownerFilter,
      include: { stage: true, company: { select: { name: true } } },
    }),
    db.task.findMany({
      where: me.role === "SALES_REP" ? { assignedToId: me.id } : {},
      include: taskInclude,
      orderBy: { dueDate: "asc" },
    }),
    db.activity.findMany({
      where: me.role === "SALES_REP"
        ? { OR: [{ deal: { ownerId: me.id } }, { contact: { ownerId: me.id } }, { userId: me.id }] }
        : {},
      include: activityInclude,
      orderBy: { occurredAt: "desc" },
      take: 10,
    }),
    db.contact.count({
      where: { ...ownerFilter, createdAt: { gte: monthStart } },
    }),
    db.user.findUnique({ where: { id: me.id }, select: { quota: true } }),
    // cuota del equipo (suma) para dirección
    me.role === "SALES_REP"
      ? Promise.resolve(null)
      : db.user.aggregate({ _sum: { quota: true } }),
  ]);

  // ---- KPIs de pipeline ----
  const openDeals = deals.filter((d) => d.status === "OPEN");
  const openValue = openDeals.reduce((s, d) => s + d.amount, 0);
  const weightedValue = openDeals.reduce(
    (s, d) => s + (d.amount * (d.stage?.probability ?? 0)) / 100,
    0
  );

  const wonMonth = deals.filter((d) => d.status === "WON" && d.closedAt && d.closedAt >= monthStart);
  const lostMonth = deals.filter((d) => d.status === "LOST" && d.closedAt && d.closedAt >= monthStart);
  const wonTotal = deals.filter((d) => d.status === "WON");
  const lostTotal = deals.filter((d) => d.status === "LOST");
  const conversionRate =
    wonTotal.length + lostTotal.length > 0
      ? Math.round((wonTotal.length / (wonTotal.length + lostTotal.length)) * 100)
      : 0;

  // ---- Tareas ----
  const openTasks = tasks.filter((t) => t.status === "PENDING");
  const overdueTasks = openTasks.filter((t) => t.dueDate && t.dueDate < now);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const todayTasks = openTasks.filter((t) => t.dueDate && t.dueDate <= todayEnd);

  // ---- Estadísticas por etapa (embudo) ----
  const stageStats = stages
    .filter((s) => !s.isWon && !s.isLost)
    .map((s) => {
      const list = openDeals.filter((d) => d.stageId === s.id);
      return {
        id: s.id,
        name: s.name,
        probability: s.probability,
        color: s.color,
        count: list.length,
        total: list.reduce((sum, d) => sum + d.amount, 0),
      };
    });

  const topOpenDeals = [...openDeals]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((d) => ({
      id: d.id,
      title: d.title,
      amount: d.amount,
      stageName: d.stage?.name ?? "—",
      stageColor: d.stage?.color ?? "#64748b",
      probability: d.stage?.probability ?? 0,
      companyName: d.company?.name ?? null,
      weighted: (d.amount * (d.stage?.probability ?? 0)) / 100,
    }));

  // ---- Cuota del mes: propia (comercial) o suma del equipo (dirección) ----
  const monthlyQuota =
    me.role === "SALES_REP"
      ? (meRecord?.quota ?? null)
      : (teamUsers?._sum.quota ?? null);
  const wonMonthValue = wonMonth.reduce((s, d) => s + d.amount, 0);
  const quota = {
    monthlyQuota,
    target: monthlyQuota,
    achieved: Math.round(wonMonthValue),
    compliance:
      monthlyQuota && monthlyQuota > 0
        ? Math.round((wonMonthValue / monthlyQuota) * 100)
        : null,
  };

  return Response.json({
    kpis: {
      openValue,
      weightedValue,
      openDealsCount: openDeals.length,
      wonMonthCount: wonMonth.length,
      wonMonthValue: wonMonth.reduce((s, d) => s + d.amount, 0),
      lostMonthCount: lostMonth.length,
      conversionRate,
      overdueTasks: overdueTasks.length,
      todayTasks: todayTasks.length,
      openTasks: openTasks.length,
      newContactsThisMonth,
    },
    stageStats,
    topOpenDeals,
    recentActivities,
    upcomingTasks: openTasks.slice(0, 8),
    quota,
  });
}
