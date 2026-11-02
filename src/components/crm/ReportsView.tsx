"use client";

// ============================================================
// Panel de reportes por comercial
// - Dirección (ADMIN / SALES_DIRECTOR): informe individual de cada
//   comercial, agregado del equipo completo y ranking comparativo.
// - Comercial (SALES_REP): siempre su propio informe.
// Métricas: ingresos ganados, previsión ponderada, tasa de éxito,
// ticket medio, ciclo de cierre, actividades omnicanal y evolución.
// ============================================================

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
} from "recharts";
import {
  api, fmtMoney, fmtDate, type SessionUser, type ReportData,
  type ReportPeriod, type Role,
} from "@/lib/client";
import { exportReportPdf } from "@/lib/report-pdf";
import { RoleBadge, UserAvatar } from "@/components/crm/shared";
import {
  Trophy, TrendingUp, Target, CircleDollarSign, Clock, PhoneCall,
  Users2, Crown, Medal, CalendarRange, FileDown,
} from "lucide-react";

const PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: "month", label: "Este mes" },
  { value: "quarter", label: "Últimos 3 meses" },
  { value: "year", label: "Este año" },
  { value: "all", label: "Histórico completo" },
];

const TYPE_COLORS: Record<string, string> = {
  CALL: "#0284c7", EMAIL: "#0d9488", MEETING: "#d97706",
  NOTE: "#64748b", SUPPORT: "#e11d48", SYSTEM: "#7c3aed",
};

// Color del % de cumplimiento: verde ≥100 · ámbar ≥70 · rojo <70
export const complianceClass = (pct: number) =>
  pct >= 100 ? "text-emerald-600" : pct >= 70 ? "text-amber-600" : "text-rose-600";

export function ReportsView({ user, reloadSignal }: { user: SessionUser; reloadSignal: number }) {
  const isManager = user.role === "ADMIN" || user.role === "SALES_DIRECTOR";
  const [period, setPeriod] = useState<ReportPeriod>("month");
  const [subject, setSubject] = useState<string>("all"); // "all" = equipo · userId = comercial
  const [result, setResult] = useState<{ key: string; data: ReportData } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [exporting, setExporting] = useState(false);

  const queryKey = `${period}|${isManager ? subject : user.id}`;

  useEffect(() => {
    const userId = isManager ? subject : user.id;
    api<ReportData>(`/api/reports?period=${period}&userId=${encodeURIComponent(userId)}`)
      .then((d) => setResult({ key: queryKey, data: d }))
      .catch((e) =>
        setError({ key: queryKey, message: e instanceof Error ? e.message : "Error cargando el informe" })
      );
  }, [reloadSignal, period, subject, isManager, user.id, queryKey]);

  const data = result && result.key === queryKey ? result.data : null;
  const viewError = error && error.key === queryKey ? error.message : null;

  if (viewError) return <p className="text-sm text-rose-600">{viewError}</p>;
  if (!data) return <ReportsSkeleton />;

  const { kpis, subject: who, quota } = data;
  const periodLabel = PERIODS.find((p) => p.value === data.period)?.label ?? "";
  const maxStageTotal = Math.max(1, ...data.stageStats.map((s) => s.total));
  const totalActivities = data.activityByType.reduce((s, a) => s + a.count, 0);

  const handleExportPdf = () => {
    setExporting(true);
    try {
      exportReportPdf(data, user);
    } finally {
      setExporting(false);
    }
  };

  const kpiCards = [
    {
      title: "Ingresos ganados", icon: <Trophy className="h-4 w-4 text-amber-500" />,
      value: fmtMoney(kpis.wonValue),
      hint: `${kpis.wonCount} ganados · ${kpis.lostCount} perdidos en ${periodLabel.toLowerCase()}`,
      bg: "bg-amber-50/50 border-amber-200",
    },
    {
      title: "Previsión ponderada", icon: <TrendingUp className="h-4 w-4 text-emerald-600" />,
      value: fmtMoney(kpis.weightedValue),
      hint: `${kpis.openCount} negocios abiertos · Σ monto × probabilidad`,
      bg: "bg-emerald-50 border-emerald-200",
    },
    {
      title: "Tasa de éxito", icon: <Target className="h-4 w-4 text-slate-600" />,
      value: `${kpis.winRate}%`,
      hint: "negocios ganados sobre cerrados del periodo",
      bg: "bg-white",
    },
    {
      title: "Ticket medio", icon: <CircleDollarSign className="h-4 w-4 text-teal-600" />,
      value: fmtMoney(kpis.avgTicket),
      hint: "importe medio de los negocios ganados",
      bg: "bg-white",
    },
    {
      title: "Ciclo de cierre", icon: <Clock className="h-4 w-4 text-slate-600" />,
      value: kpis.avgCycleDays === null ? "—" : `${kpis.avgCycleDays} días`,
      hint: "de la creación del negocio al cierre ganado",
      bg: "bg-white",
    },
    {
      title: "Actividades", icon: <PhoneCall className="h-4 w-4 text-rose-500" />,
      value: `${kpis.activitiesCount}`,
      hint: `${kpis.newContacts} contactos nuevos · ${kpis.tasksOverdue} tareas vencidas`,
      bg: kpis.tasksOverdue > 0 ? "bg-rose-50 border-rose-200" : "bg-white",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Controles: periodo + exportar PDF + comercial */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select value={period} onValueChange={(v) => setPeriod(v as ReportPeriod)}>
            <SelectTrigger className="w-full sm:w-56" aria-label="Periodo del informe">
              <CalendarRange className="h-4 w-4 text-slate-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={handleExportPdf}
            disabled={exporting}
            variant="outline"
            className="border-emerald-600 text-emerald-700 hover:bg-emerald-50"
            aria-label="Exportar informe a PDF"
          >
            <FileDown className="h-4 w-4" /> {exporting ? "Generando…" : "Exportar PDF"}
          </Button>
        </div>

        {isManager && (
          <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Seleccionar comercial">
            <button
              onClick={() => setSubject("all")}
              aria-pressed={subject === "all"}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                subject === "all"
                  ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
              }`}
            >
              <Users2 className="h-4 w-4" /> Todo el equipo
            </button>
            {data.users?.map((u) => (
              <button
                key={u.id}
                onClick={() => setSubject(u.id)}
                aria-pressed={subject === u.id}
                className={`flex shrink-0 items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm font-medium transition ${
                  subject === u.id
                    ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
                }`}
              >
                <UserAvatar name={u.name} className="h-6 w-6" />
                {u.name.split(" ")[0]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Sujeto del informe */}
      <div className="flex items-center gap-3 rounded-xl border bg-white p-4">
        {who.isTeam ? (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
            <Users2 className="h-5 w-5 text-emerald-700" />
          </div>
        ) : (
          <UserAvatar name={who.name} className="h-10 w-10" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">
            {who.isTeam ? `Informe del equipo completo${data.teamSize ? ` · ${data.teamSize} comerciales` : ""}` : `Informe de ${who.name}`}
          </p>
          <p className="truncate text-xs text-slate-500">{who.email ?? periodLabel}</p>
        </div>
        {who.role ? <RoleBadge role={who.role} /> : <Badge variant="secondary">Vista agregada</Badge>}
      </div>

      {/* Cuota y cumplimiento % */}
      {quota.target !== null && quota.target > 0 ? (
        <Card className="border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-white transition hover:shadow-md">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100">
              <Target className="h-5 w-5 text-emerald-700" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Cumplimiento de cuota · {periodLabel.toLowerCase()}{who.isTeam ? " (suma del equipo)" : ""}
              </p>
              <div className="flex items-baseline gap-2">
                <p className={`text-3xl font-bold ${quota.compliance !== null ? complianceClass(quota.compliance) : "text-slate-400"}`}>
                  {quota.compliance !== null ? `${quota.compliance}%` : "—"}
                </p>
                <p className="text-sm text-slate-500">
                  {fmtMoney(quota.achieved)} de {fmtMoney(quota.target)}
                </p>
              </div>
              <p className="text-xs text-slate-400">
                Cuota mensual: {fmtMoney(quota.monthlyQuota ?? 0)}
                {data.period === "quarter" && " · objetivo trimestral = cuota × 3"}
                {data.period === "year" && " · objetivo anual = cuota × 12"}
              </p>
            </div>
            <div className="w-full sm:w-64">
              <Progress
                value={Math.min(100, quota.compliance ?? 0)}
                className="h-3 [&>div]:bg-emerald-500"
                aria-label={`Cumplimiento de cuota: ${quota.compliance ?? 0}%`}
              />
              <p className="mt-1.5 text-right text-xs font-medium text-slate-500">
                {quota.achieved >= quota.target
                  ? `Objetivo superado · +${fmtMoney(quota.achieved - quota.target)}`
                  : `Faltan ${fmtMoney(quota.target - quota.achieved)}`}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : quota.monthlyQuota === null ? (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-500">
          <Target className="h-4 w-4 shrink-0 text-slate-400" />
          {isManager
            ? "Sin cuota asignada: define un objetivo mensual en la vista Usuarios para calcular el cumplimiento %."
            : "Aún no tienes cuota asignada: administración puede fijarla en la vista Usuarios."}
        </div>
      ) : null}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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

      {/* Gráficos: evolución mensual + actividades por tipo */}
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3 min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-emerald-600" /> Evolución mensual — ingresos ganados
            </CardTitle>
            <p className="text-xs text-slate-400">Últimos 6 meses · barra = € ganados, línea = nº de negocios</p>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={false} />
                  <YAxis
                    yAxisId="money" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false}
                    tickFormatter={(v) => fmtMoney(Number(v), true)} width={64}
                  />
                  <YAxis
                    yAxisId="count" orientation="right" allowDecimals={false}
                    tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={30}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(16,185,129,0.07)" }}
                    formatter={(value, name) =>
                      name === "Ingresos ganados"
                        ? [fmtMoney(Number(value)), "Ingresos ganados"]
                        : [`${Number(value)} negocio${Number(value) === 1 ? "" : "s"}`, name]
                    }
                    labelFormatter={(l) => `Mes de ${l}`}
                    contentStyle={{ borderRadius: 10, borderColor: "#e2e8f0", fontSize: 12 }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="wonValue" name="Ingresos ganados" yAxisId="money" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={42} />
                  <Line
                    dataKey="wonCount" name="Negocios ganados" yAxisId="count"
                    stroke="#334155" strokeWidth={2} strokeDasharray="5 3"
                    dot={{ r: 3, fill: "#334155" }} isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <PhoneCall className="h-4 w-4 text-emerald-600" /> Actividades por tipo
            </CardTitle>
            <p className="text-xs text-slate-400">{periodLabel} · {totalActivities} interacciones registradas</p>
          </CardHeader>
          <CardContent>
            {totalActivities === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">Sin actividades en este periodo.</p>
            ) : (
              <div className="space-y-2">
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.activityByType} dataKey="count" nameKey="label"
                        innerRadius={48} outerRadius={72} paddingAngle={3} strokeWidth={2}
                      >
                        {data.activityByType.map((t) => (
                          <Cell key={t.type} fill={TYPE_COLORS[t.type] ?? "#94a3b8"} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [`${Number(value)} actividades`, "Registradas"]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="space-y-1.5">
                  {data.activityByType.map((t) => (
                    <li key={t.type} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-slate-700">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TYPE_COLORS[t.type] ?? "#94a3b8" }} />
                        {t.label}
                      </span>
                      <span className="text-slate-500">
                        {t.count} <span className="text-slate-400">({Math.round((t.count / totalActivities) * 100)}%)</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Embudo + negocios destacados */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Embudo por etapa — pipeline abierto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.stageStats.length === 0 && <p className="text-sm text-slate-500">Sin etapas configuradas.</p>}
            {data.stageStats.map((s) => (
              <div key={s.id} className="space-y-1">
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2 text-sm">
                  <span className="font-medium text-slate-700">
                    {s.name} <span className="text-xs text-slate-400">({s.probability}%)</span>
                  </span>
                  <span className="text-xs text-slate-500 sm:text-right">
                    {s.count} · <strong className="text-slate-700">{fmtMoney(s.total)}</strong>{" "}
                    <span className="text-emerald-600">pond. {fmtMoney(s.weighted, true)}</span>
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

        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Negocios destacados</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="open">
              <TabsList className="mb-3">
                <TabsTrigger value="open">En el embudo</TabsTrigger>
                <TabsTrigger value="won">Ganados ({periodLabel.toLowerCase()})</TabsTrigger>
              </TabsList>
              <TabsContent value="open" className="space-y-3">
                {data.topOpenDeals.length === 0 && <p className="text-sm text-slate-500">Sin negocios abiertos.</p>}
                {data.topOpenDeals.map((d) => (
                  <div key={d.id} className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{d.title}</p>
                      <p className="text-xs text-slate-500">
                        {d.companyName ?? "Sin empresa"}{who.isTeam ? ` · ${d.ownerName ?? "—"}` : ""}
                      </p>
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
              </TabsContent>
              <TabsContent value="won" className="space-y-3">
                {data.topWonDeals.length === 0 && (
                  <p className="text-sm text-slate-500">Todavía no hay negocios ganados en este periodo.</p>
                )}
                {data.topWonDeals.map((d) => (
                  <div key={d.id} className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{d.title}</p>
                      <p className="text-xs text-slate-500">
                        {d.companyName ?? "Sin empresa"} · cerrado el {fmtDate(d.closedAt)}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-amber-600">{fmtMoney(d.amount, true)}</p>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Ranking del equipo (solo dirección) */}
      {data.ranking && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Crown className="h-4 w-4 text-amber-500" /> Ranking de comerciales — {periodLabel.toLowerCase()}
            </CardTitle>
            <p className="text-xs text-slate-400">
              Ganado, cuota y tasa de éxito corresponden al periodo; pipeline y previsión son el estado actual del embudo.
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Comercial</TableHead>
                  <TableHead className="text-right">Cuota</TableHead>
                  <TableHead className="text-right">Cumpl.</TableHead>
                  <TableHead className="text-right">Ganado</TableHead>
                  <TableHead className="text-right">Deals</TableHead>
                  <TableHead className="text-right">Tasa éxito</TableHead>
                  <TableHead className="text-right">Pipeline abierto</TableHead>
                  <TableHead className="text-right">Previsión</TableHead>
                  <TableHead className="text-right">Activ.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.ranking.map((r, i) => (
                  <TableRow key={r.userId} className={r.userId === user.id ? "bg-emerald-50/70" : undefined}>
                    <TableCell className="font-medium">
                      {i === 0 ? (
                        <span className="flex items-center gap-1 font-bold text-amber-600"><Crown className="h-4 w-4" />1</span>
                      ) : i <= 2 ? (
                        <span className="flex items-center gap-1 text-slate-500"><Medal className="h-3.5 w-3.5" />{i + 1}</span>
                      ) : (
                        <span className="text-slate-400">{i + 1}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <UserAvatar name={r.name} className="h-7 w-7" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">
                            {r.name}{r.userId === user.id && <span className="ml-1 text-xs text-emerald-600">(tú)</span>}
                          </p>
                          <p className="text-[11px] text-slate-400">{r.role === "ADMIN" ? "Administrador" : r.role === "SALES_DIRECTOR" ? "Director comercial" : "Comercial"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm text-slate-500">
                      {r.quotaTarget !== null ? (
                        <span title={`Cuota mensual: ${fmtMoney(r.quota ?? 0)}`}>{fmtMoney(r.quotaTarget, true)}</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.compliance !== null ? (
                        <span className={`text-sm font-semibold ${complianceClass(r.compliance)}`}>{r.compliance}%</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-emerald-700">{fmtMoney(r.wonValue)}</TableCell>
                    <TableCell className="text-right text-sm text-slate-600">
                      {r.wonCount} <span className="text-slate-400">/ {r.lostCount} perd.</span>
                    </TableCell>
                    <TableCell className="text-right text-sm text-slate-600">{r.winRate}%</TableCell>
                    <TableCell className="text-right text-sm text-slate-600">{fmtMoney(r.openValue)}</TableCell>
                    <TableCell className="text-right text-sm font-medium text-slate-800">{fmtMoney(r.weightedValue)}</TableCell>
                    <TableCell className="text-right text-sm text-slate-600">{r.activitiesCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ReportsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-full sm:w-56 rounded-lg" />
      <Skeleton className="h-16 rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <Skeleton className="h-96 rounded-xl lg:col-span-3" />
        <Skeleton className="h-96 rounded-xl lg:col-span-2" />
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}
