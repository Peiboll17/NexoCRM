"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { api, fmtMoney, fmtDate, relativeDays, isOverdue, PRIORITY_LABELS, fullName, type SessionUser, type DashboardData, type TaskRow } from "@/lib/client";
import { ActivityIcon } from "@/components/crm/shared";
import { useToast } from "@/hooks/use-toast";
import {
  TrendingUp, Target, Trophy, ListChecks, Users, AlertTriangle,
  ArrowUpRight, CircleDollarSign,
} from "lucide-react";

export function DashboardView({ user, reloadSignal }: { user: SessionUser; reloadSignal: number }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const load = () => {
    api<DashboardData>("/api/dashboard")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Error cargando dashboard"));
  };

  useEffect(load, [reloadSignal]);

  const toggleTask = async (task: TaskRow) => {
    try {
      await api(`/api/tasks/${task.id}`, { method: "PATCH", json: { status: task.status === "DONE" ? "PENDING" : "DONE" } });
      setData((prev) =>
        prev ? { ...prev, upcomingTasks: prev.upcomingTasks.filter((t) => t.id !== task.id) } : prev
      );
      toast({ title: task.status === "DONE" ? "Tarea reabierta" : "Tarea completada ✅" });
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  if (error) return <p className="text-sm text-rose-600">{error}</p>;
  if (!data) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  const { kpis, stageStats, topOpenDeals, recentActivities, upcomingTasks, quota } = data;
  const maxStageTotal = Math.max(1, ...stageStats.map((s) => s.total));
  const quotaCls = quota.compliance !== null
    ? quota.compliance >= 100 ? "text-emerald-600" : quota.compliance >= 70 ? "text-amber-600" : "text-rose-600"
    : "text-slate-400";

  const kpiCards = [
    {
      title: "Previsión ponderada", icon: <TrendingUp className="h-4 w-4 text-emerald-600" />,
      value: fmtMoney(kpis.weightedValue),
      hint: `${kpis.openDealsCount} negocios abiertos · Σ monto × probabilidad`,
      bg: "bg-emerald-50 border-emerald-200",
    },
    {
      title: "Valor en embudo", icon: <CircleDollarSign className="h-4 w-4 text-slate-600" />,
      value: fmtMoney(kpis.openValue),
      hint: "Total de negociaciones abiertas",
      bg: "bg-white",
    },
    {
      title: "Ganado este mes", icon: <Trophy className="h-4 w-4 text-amber-500" />,
      value: fmtMoney(kpis.wonMonthValue),
      hint: `${kpis.wonMonthCount} cerrados · conversión ${kpis.conversionRate}%`,
      bg: "bg-amber-50/50 border-amber-200",
    },
    {
      title: user.role === "SALES_REP" ? "Tareas pendientes" : "Tareas del equipo",
      icon: <ListChecks className="h-4 w-4 text-rose-600" />,
      value: `${kpis.overdueTasks}`,
      hint: `vencidas · ${kpis.todayTasks} para hoy · ${kpis.openTasks} abiertas`,
      bg: kpis.overdueTasks > 0 ? "bg-rose-50 border-rose-200" : "bg-white",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Cuota del mes — solo si hay objetivo configurado */}
      {quota.target !== null && quota.target > 0 && (
        <Card className="border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-white transition hover:shadow-md">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100">
              <Target className="h-5 w-5 text-emerald-700" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {user.role === "SALES_REP" ? "Tu cuota del mes" : "Cuota del equipo · mes en curso"}
              </p>
              <div className="flex items-baseline gap-2">
                <p className={`text-3xl font-bold ${quotaCls}`}>
                  {quota.compliance !== null ? `${quota.compliance}%` : "—"}
                </p>
                <p className="text-sm text-slate-500">de cumplimiento ({fmtMoney(quota.achieved)} de {fmtMoney(quota.target)})</p>
              </div>
            </div>
            <div className="w-full sm:w-64">
              <Progress value={Math.min(100, quota.compliance ?? 0)} className="h-3 [&>div]:bg-emerald-500" aria-label="Progreso de cuota mensual" />
              <p className="mt-1.5 text-right text-xs font-medium text-slate-500">
                {quota.achieved >= quota.target
                  ? `Objetivo superado · +${fmtMoney(quota.achieved - quota.target)}`
                  : `Faltan ${fmtMoney(quota.target - quota.achieved)}`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((k) => (
          <Card key={k.title} className={`${k.bg} transition hover:shadow-md`}>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="flex items-center gap-2 text-xs font-medium text-slate-500 uppercase tracking-wide">
                {k.icon} {k.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold text-slate-900">{k.value}</p>
              <p className="text-xs text-slate-500 mt-1">{k.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Embudo por etapas */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 text-emerald-600" /> Embudo comercial por etapa
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stageStats.length === 0 && <p className="text-sm text-slate-500">Sin etapas configuradas.</p>}
            {stageStats.map((s) => (
              <div key={s.id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">
                    {s.name} <span className="text-xs text-slate-400">({s.probability}%)</span>
                  </span>
                  <span className="text-xs text-slate-500">
                    {s.count} negocio{s.count === 1 ? "" : "s"} · <strong className="text-slate-700">{fmtMoney(s.total)}</strong>
                  </span>
                </div>
                <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.max(2, (s.total / maxStageTotal) * 100)}%`, backgroundColor: s.color }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Top negocios abiertos */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowUpRight className="h-4 w-4 text-emerald-600" /> Mayores oportunidades
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topOpenDeals.length === 0 && <p className="text-sm text-slate-500">No hay negocios abiertos.</p>}
            {topOpenDeals.map((d) => (
              <div key={d.id} className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{d.title}</p>
                  <p className="text-xs text-slate-500">{d.companyName ?? "Sin empresa"}</p>
                  <Badge variant="outline" className="mt-1 text-[10px]" style={{ borderColor: d.stageColor, color: d.stageColor }}>
                    {d.stageName} · {d.probability}%
                  </Badge>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-slate-800">{fmtMoney(d.amount, true)}</p>
                  <p className="text-xs text-emerald-600 font-medium">ponder. {fmtMoney(d.weighted, true)}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Feed omnicanal */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-emerald-600" /> Actividad reciente del equipo
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 space-y-3 overflow-y-auto pr-2">
            {recentActivities.length === 0 && <p className="text-sm text-slate-500">Sin actividad todavía.</p>}
            {recentActivities.map((a) => (
              <div key={a.id} className="flex gap-3">
                <ActivityIcon type={a.type} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 leading-snug">{a.subject}</p>
                  {a.description && <p className="text-xs text-slate-500 line-clamp-2">{a.description}</p>}
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {a.contact ? fullName(a.contact) : "—"}
                    {a.deal ? ` · ${a.deal.title}` : ""}
                    {a.user ? ` · ${a.user.name}` : ""} · {relativeDays(a.occurredAt)}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Próximas tareas */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              {kpis.overdueTasks > 0 && <AlertTriangle className="h-4 w-4 text-rose-500" />}
              Próximas tareas {user.role !== "SALES_REP" ? "del equipo" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 space-y-2 overflow-y-auto pr-2">
            {upcomingTasks.length === 0 && <p className="text-sm text-slate-500">Todo al día, no queda nada pendiente. 🎉</p>}
            {upcomingTasks.map((t) => {
              const overdue = t.dueDate && isOverdue(t.dueDate);
              return (
                <div key={t.id} className="flex items-start gap-3 rounded-lg border border-slate-100 p-2.5 hover:bg-slate-50">
                  <Checkbox className="mt-0.5" onCheckedChange={() => toggleTask(t)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 leading-snug">{t.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <Badge variant={t.priority === "HIGH" ? "destructive" : "secondary"} className="h-5 px-1.5 text-[10px]">
                        {PRIORITY_LABELS[t.priority]}
                      </Badge>
                      {t.dueDate && (
                        <span className={overdue ? "font-semibold text-rose-600" : "text-slate-500"}>
                          {overdue ? "⚠ vencida " : "vence "} {relativeDays(t.dueDate)} ({fmtDate(t.dueDate)})
                        </span>
                      )}
                      {t.assignedTo && <span className="text-slate-400">· {t.assignedTo.name}</span>}
                      {t.deal && <span className="text-slate-400">· {t.deal.title}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
