import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, UNAUTHORIZED, isManager, jsonError } from "@/lib/auth";
import type { ReportPeriod } from "@/lib/client";

// ============================================================
// Panel de reportes por comercial
// ------------------------------------------------------------
// RBAC:
//  - SALES_REP  → solo puede ver su propio informe (userId ignorado)
//  - SALES_DIRECTOR / ADMIN → informe individual de cualquier comercial
//    o agregado de todo el equipo (userId=all) + ranking comparativo
// Métricas: ingresos ganados, previsión ponderada (Σ monto × probabilidad),
// tasa de éxito, ticket medio, ciclo medio de cierre, actividades
// omnicanal, tareas y evolución mensual (últimos 6 meses).
// ============================================================

const VALID_PERIODS = new Set(["month", "quarter", "year", "all"]);
const ACTIVITY_LABELS: Record<string, string> = {
  CALL: "Llamada", EMAIL: "Email", MEETING: "Reunión",
  NOTE: "Nota", SUPPORT: "Soporte", SYSTEM: "Sistema",
};
const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DAY_MS = 86_400_000;

function periodStart(period: ReportPeriod): Date | null {
  const now = new Date();
  switch (period) {
    case "month": return new Date(now.getFullYear(), now.getMonth(), 1);
    case "quarter": return new Date(now.getFullYear(), now.getMonth() - 2, 1);
    case "year": return new Date(now.getFullYear(), 0, 1);
    case "all": return null;
  }
}

export async function GET(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();

  const url = new URL(req.url);
  const periodParam = url.searchParams.get("period") ?? "month";
  const period: ReportPeriod = VALID_PERIODS.has(periodParam) ? (periodParam as ReportPeriod) : "month";
  const manager = isManager(me.role);

  // Un comercial siempre consulta su propio informe; dirección elige comercial o equipo.
  const requested = url.searchParams.get("userId") ?? "all";
  const subjectId = manager ? (requested === "all" ? null : requested) : me.id;

  let subjectUser: { id: string; name: string; email: string; role: string; quota: number | null } | null = null;
  if (subjectId) {
    subjectUser = await db.user.findUnique({
      where: { id: subjectId },
      select: { id: true, name: true, email: true, role: true, quota: true },
    });
    if (!subjectUser) return jsonError("Comercial no encontrado", 404);
  }

  const start = periodStart(period);
  const now = new Date();

  // ---- Cuota / objetivo: cuota MENSUAL escalada al periodo seleccionado ----
  // month → cuota · quarter → ×3 · year → ×12 · all → sin objetivo comparable
  const PERIOD_FACTOR: Record<ReportPeriod, number | null> = {
    month: 1, quarter: 3, year: 12, all: null,
  };
  const factor = PERIOD_FACTOR[period];

  // Dirección carga todo y filtra en memoria (permite ranking + informe individual
  // con una sola consulta por tabla). Un comercial solo carga lo suyo.
  const [users, deals, activities, tasks, stages, newContacts] = await Promise.all([
    manager
      ? db.user.findMany({ select: { id: true, name: true, email: true, role: true, quota: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    db.deal.findMany({
      where: manager ? {} : { ownerId: me.id },
      include: {
        stage: true,
        company: { select: { name: true } },
        owner: { select: { id: true, name: true } },
      },
    }),
    db.activity.findMany({
      where: manager ? {} : { userId: me.id },
      select: { type: true, occurredAt: true, userId: true },
    }),
    db.task.findMany({
      where: manager ? {} : { assignedToId: me.id },
      select: { status: true, dueDate: true, updatedAt: true, assignedToId: true },
    }),
    db.stage.findMany({ orderBy: { order: "asc" } }),
    db.contact.count({
      where: {
        ...(subjectId ? { ownerId: subjectId } : {}),
        ...(start ? { createdAt: { gte: start } } : {}),
      },
    }),
  ]);

  // ---- Subconjunto del sujeto del informe (comercial o equipo) ----
  const subjectDeals = subjectId ? deals.filter((d) => d.ownerId === subjectId) : deals;
  const subjectActivities = subjectId ? activities.filter((a) => a.userId === subjectId) : activities;
  const subjectTasks = subjectId ? tasks.filter((t) => t.assignedToId === subjectId) : tasks;

  // ---- KPIs del periodo ----
  const openDeals = subjectDeals.filter((d) => d.status === "OPEN");
  const wonDeals = subjectDeals.filter(
    (d) => d.status === "WON" && d.closedAt && (!start || d.closedAt >= start)
  );
  const lostDeals = subjectDeals.filter(
    (d) => d.status === "LOST" && d.closedAt && (!start || d.closedAt >= start)
  );

  const wonValue = wonDeals.reduce((s, d) => s + d.amount, 0);
  const winRate =
    wonDeals.length + lostDeals.length > 0
      ? Math.round((wonDeals.length / (wonDeals.length + lostDeals.length)) * 100)
      : 0;
  const avgTicket = wonDeals.length > 0 ? Math.round(wonValue / wonDeals.length) : 0;
  const cycles = wonDeals
    .filter((d) => d.closedAt && d.createdAt)
    .map((d) => (d.closedAt!.getTime() - d.createdAt.getTime()) / DAY_MS);
  const avgCycleDays =
    cycles.length > 0 ? Math.round(cycles.reduce((s, c) => s + c, 0) / cycles.length) : null;

  // ---- Actividades omnicanal (periodo + desglose por tipo) ----
  const periodActivities = subjectActivities.filter((a) => !start || a.occurredAt >= start);
  const byType = new Map<string, number>();
  for (const a of periodActivities) byType.set(a.type, (byType.get(a.type) ?? 0) + 1);
  const activityByType = [...byType.entries()]
    .map(([type, count]) => ({ type, label: ACTIVITY_LABELS[type] ?? type, count }))
    .sort((a, b) => b.count - a.count);

  // ---- Tareas ----
  const tasksDone = subjectTasks.filter(
    (t) => t.status === "DONE" && (!start || t.updatedAt >= start)
  ).length;
  const openTaskRows = subjectTasks.filter((t) => t.status === "PENDING");
  const tasksOverdue = openTaskRows.filter((t) => t.dueDate && t.dueDate < now).length;

  // ---- Embudo por etapa (estado actual del pipeline) ----
  const stageStats = stages
    .filter((s) => !s.isWon && !s.isLost)
    .map((s) => {
      const list = openDeals.filter((d) => d.stageId === s.id);
      const total = list.reduce((sum, d) => sum + d.amount, 0);
      return {
        id: s.id,
        name: s.name,
        color: s.color,
        probability: s.probability,
        count: list.length,
        total,
        weighted: Math.round((total * s.probability) / 100),
      };
    });

  // ---- Evolución mensual (últimos 6 meses, ventana fija) ----
  const buckets: { key: string; label: string; year: number; month: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: MONTHS_ES[d.getMonth()],
      year: d.getFullYear(),
      month: d.getMonth(),
    });
  }
  const monthly = buckets.map((b) => {
    const inBucket = (date: Date | null | undefined) =>
      !!date && date.getFullYear() === b.year && date.getMonth() === b.month;
    const won = subjectDeals.filter((d) => d.status === "WON" && inBucket(d.closedAt));
    const lost = subjectDeals.filter((d) => d.status === "LOST" && inBucket(d.closedAt));
    return {
      key: b.key,
      label: b.label,
      wonValue: won.reduce((s, d) => s + d.amount, 0),
      wonCount: won.length,
      lostCount: lost.length,
      createdCount: subjectDeals.filter((d) => inBucket(d.createdAt)).length,
    };
  });

  // ---- Top negocios ----
  const topOpenDeals = [...openDeals]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((d) => ({
      id: d.id,
      title: d.title,
      amount: d.amount,
      weighted: Math.round((d.amount * (d.stage?.probability ?? 0)) / 100),
      stageName: d.stage?.name ?? "—",
      stageColor: d.stage?.color ?? "#64748b",
      probability: d.stage?.probability ?? 0,
      companyName: d.company?.name ?? null,
      ownerName: d.owner?.name ?? null,
    }));

  const topWonDeals = [...wonDeals]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((d) => ({
      id: d.id,
      title: d.title,
      amount: d.amount,
      companyName: d.company?.name ?? null,
      closedAt: d.closedAt?.toISOString() ?? null,
      ownerName: d.owner?.name ?? null,
    }));

  // ---- Cuota / cumplimiento (sobre wonValue del periodo) ----
  const monthlyQuota =
    subjectId
      ? (subjectUser?.quota ?? null)
      : manager
        ? users.reduce((s, u) => s + (u.quota ?? 0), 0) || null
        : null;
  const quotaTarget =
    monthlyQuota !== null && factor !== null ? Math.round(monthlyQuota * factor) : null;
  const quotaAchieved = Math.round(wonValue);
  const quotaCompliance =
    quotaTarget && quotaTarget > 0
      ? Math.round((quotaAchieved / quotaTarget) * 100)
      : null;

  // ---- Ranking del equipo (solo dirección) ----
  let ranking: RankingRow[] | null = null;
  if (manager) {
    const actsByUser = new Map<string, number>();
    for (const a of activities) {
      if (!a.userId) continue;
      if (start && a.occurredAt < start) continue;
      actsByUser.set(a.userId, (actsByUser.get(a.userId) ?? 0) + 1);
    }
    ranking = users
      .map((u) => {
        const own = deals.filter((d) => d.ownerId === u.id);
        const won = own.filter(
          (d) => d.status === "WON" && d.closedAt && (!start || d.closedAt >= start)
        );
        const lost = own.filter(
          (d) => d.status === "LOST" && d.closedAt && (!start || d.closedAt >= start)
        );
        const open = own.filter((d) => d.status === "OPEN");
        const wonValue = won.reduce((s, d) => s + d.amount, 0);
        const quotaTarget =
          u.quota != null && factor !== null ? Math.round(u.quota * factor) : null;
        return {
          userId: u.id,
          name: u.name,
          role: u.role,
          quota: u.quota ?? null,
          quotaTarget,
          compliance:
            quotaTarget && quotaTarget > 0
              ? Math.round((wonValue / quotaTarget) * 100)
              : null,
          wonValue,
          wonCount: won.length,
          lostCount: lost.length,
          winRate:
            won.length + lost.length > 0
              ? Math.round((won.length / (won.length + lost.length)) * 100)
              : 0,
          openValue: open.reduce((s, d) => s + d.amount, 0),
          weightedValue: open.reduce(
            (s, d) => s + (d.amount * (d.stage?.probability ?? 0)) / 100,
            0
          ),
          activitiesCount: actsByUser.get(u.id) ?? 0,
        };
      })
      .sort((a, b) => b.wonValue - a.wonValue || b.weightedValue - a.weightedValue);
  }

  return Response.json({
    period,
    subject: {
      id: subjectId,
      name: subjectUser?.name ?? (manager ? "Equipo completo" : me.name),
      email: subjectUser?.email ?? null,
      role: subjectUser?.role ?? null,
      isTeam: !subjectId,
    },
    teamSize: manager && !subjectId ? users.length : null,
    kpis: {
      wonValue,
      wonCount: wonDeals.length,
      lostCount: lostDeals.length,
      winRate,
      openValue: openDeals.reduce((s, d) => s + d.amount, 0),
      weightedValue: openDeals.reduce(
        (s, d) => s + (d.amount * (d.stage?.probability ?? 0)) / 100,
        0
      ),
      openCount: openDeals.length,
      avgTicket,
      avgCycleDays,
      activitiesCount: periodActivities.length,
      tasksDone,
      tasksOpen: openTaskRows.length,
      tasksOverdue,
      newContacts,
    },
    quota: {
      monthlyQuota,
      target: quotaTarget,
      achieved: quotaAchieved,
      compliance: quotaCompliance,
    },
    activityByType,
    stageStats,
    monthly,
    topOpenDeals,
    topWonDeals,
    users: manager ? users.map((u) => ({ id: u.id, name: u.name, role: u.role })) : null,
    ranking,
  });
}

type RankingRow = {
  userId: string;
  name: string;
  role: string;
  quota: number | null;
  quotaTarget: number | null;
  compliance: number | null;
  wonValue: number;
  wonCount: number;
  lostCount: number;
  winRate: number;
  openValue: number;
  weightedValue: number;
  activitiesCount: number;
};
