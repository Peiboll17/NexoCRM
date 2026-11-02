"use client";

// ============================================================
// Cliente HTTP + tipos compartidos + formateadores (es-ES)
// ============================================================

export type Role = "ADMIN" | "SALES_DIRECTOR" | "SALES_REP";
export type SessionUser = { id: string; email: string; name: string; role: Role };

export type Stage = {
  id: string; name: string; order: number; probability: number;
  color: string; isWon: boolean; isLost: boolean;
};

export type DealStatus = "OPEN" | "WON" | "LOST";

export type DealCard = {
  id: string; title: string; amount: number; currency: string; status: DealStatus;
  expectedCloseDate: string | null; closedAt: string | null; source: string | null;
  stage: Stage | null;
  company: { id: string; name: string } | null;
  contact: { id: string; firstName: string; lastName: string | null; email: string | null } | null;
  owner: { id: string; name: string } | null;
  createdAt: string; updatedAt: string;
};

export type ContactRow = {
  id: string; firstName: string; lastName: string | null; email: string | null;
  phone: string | null; position: string | null; linkedin: string | null; notes: string | null;
  companyId?: string | null;
  company: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  ownerId?: string | null;
  createdAt: string;
  _count?: { deals: number; activities: number; tasks: number };
};

export type CompanyRow = {
  id: string; name: string; legalName: string | null; website: string | null;
  sector: string | null; address: string | null; city: string | null; country: string | null;
  phone: string | null; notes: string | null;
  owner: { id: string; name: string } | null;
  createdAt: string;
  _count?: { contacts: number; deals: number };
};

export type ActivityRow = {
  id: string; type: string; subject: string; description: string | null; occurredAt: string;
  user: { id: string; name: string } | null;
  contact?: { id: string; firstName: string; lastName: string | null } | null;
  deal?: { id: string; title: string } | null;
};

export type TaskRow = {
  id: string; title: string; description: string | null; dueDate: string | null;
  status: "PENDING" | "DONE"; priority: "LOW" | "MEDIUM" | "HIGH";
  assignedTo: { id: string; name: string } | null;
  assignedToId?: string | null;
  contact: { id: string; firstName: string; lastName: string | null } | null;
  deal: { id: string; title: string } | null;
};

export type AutomationRuleRow = {
  id: string; name: string; trigger: string; triggerStage: string | null;
  actionType: string; actionConfig: string; active: boolean; createdAt: string;
  _count: { logs: number };
};

export type AutomationLogRow = {
  id: string; ruleId: string | null;
  rule?: { id: string; name: string } | null;
  message: string; createdAt: string;
};

export type UserRow = {
  id: string; name: string; email: string; role: Role; quota: number | null; createdAt: string;
  _count: { dealsOwned: number; contactsOwned: number; tasksAssigned: number };
};

export type DashboardData = {
  kpis: {
    openValue: number; weightedValue: number; openDealsCount: number;
    wonMonthCount: number; wonMonthValue: number; lostMonthCount: number;
    conversionRate: number; overdueTasks: number; todayTasks: number;
    openTasks: number; newContactsThisMonth: number;
  };
  stageStats: { id: string; name: string; probability: number; color: string; count: number; total: number }[];
  topOpenDeals: { id: string; title: string; amount: number; stageName: string; stageColor: string; probability: number; companyName: string | null; weighted: number }[];
  recentActivities: ActivityRow[];
  upcomingTasks: TaskRow[];
  quota: { monthlyQuota: number | null; target: number | null; achieved: number; compliance: number | null };
};

// ---------- Reportes por comercial ----------

export type ReportPeriod = "month" | "quarter" | "year" | "all";

export type RankingRow = {
  userId: string; name: string; role: Role;
  quota: number | null; quotaTarget: number | null; compliance: number | null;
  wonValue: number; wonCount: number; lostCount: number; winRate: number;
  openValue: number; weightedValue: number; activitiesCount: number;
};

export type QuotaInfo = {
  monthlyQuota: number | null; // cuota mensual configurada
  target: number | null; // objetivo escalado al periodo (null en "Histórico")
  achieved: number; // ingresos ganados del periodo
  compliance: number | null; // % cumplimiento
};

export type NotificationRow = {
  id: string; type: string; title: string; body: string; payload: string;
  readAt: string | null; createdAt: string;
};

export type ReportData = {
  period: ReportPeriod;
  subject: { id: string | null; name: string; email: string | null; role: Role | null; isTeam: boolean };
  teamSize: number | null;
  kpis: {
    wonValue: number; wonCount: number; lostCount: number; winRate: number;
    openValue: number; weightedValue: number; openCount: number;
    avgTicket: number; avgCycleDays: number | null;
    activitiesCount: number; tasksDone: number; tasksOpen: number; tasksOverdue: number;
    newContacts: number;
  };
  activityByType: { type: string; label: string; count: number }[];
  stageStats: { id: string; name: string; color: string; probability: number; count: number; total: number; weighted: number }[];
  monthly: { key: string; label: string; wonValue: number; wonCount: number; lostCount: number; createdCount: number }[];
  topOpenDeals: {
    id: string; title: string; amount: number; weighted: number;
    stageName: string; stageColor: string; probability: number;
    companyName: string | null; ownerName: string | null;
  }[];
  topWonDeals: {
    id: string; title: string; amount: number;
    companyName: string | null; closedAt: string | null; ownerName: string | null;
  }[];
  users: { id: string; name: string; role: Role }[] | null;
  ranking: RankingRow[] | null;
  quota: QuotaInfo;
};

export type ContactDetail = ContactRow & {
  company: CompanyRow | null;
  deals: (DealCard & { expectedCloseDate: string | null })[];
  activities: ActivityRow[];
  tasks: TaskRow[];
};

// ---------- HTTP ----------

export async function api<T>(
  url: string,
  options?: RequestInit & { json?: unknown }
): Promise<T> {
  const { json, ...rest } = options || {};
  const res = await fetch(url, {
    ...rest,
    headers: json ? { "Content-Type": "application/json", ...(rest.headers || {}) } : rest.headers,
    body: json ? JSON.stringify(json) : rest.body,
    cache: "no-store",
  });
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: string })?.error || `Error ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

// ---------- Formateadores ----------

export const fmtMoney = (n: number, compact = false) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency", currency: "EUR", maximumFractionDigits: 0,
    notation: compact ? "compact" : "standard",
  }).format(n);

export const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "—";

export const fmtDateTime = (s?: string | null) =>
  s
    ? new Date(s).toLocaleString("es-ES", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : "—";

export function relativeDays(s?: string | null): string {
  if (!s) return "";
  const d = new Date(s);
  const today = new Date();
  d.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (days === 0) return "hoy";
  if (days === 1) return "mañana";
  if (days === -1) return "ayer";
  if (days > 1) return `en ${days} días`;
  return `hace ${-days} días`;
}

export const isOverdue = (s?: string | null) => {
  if (!s) return false;
  const d = new Date(s);
  const now = new Date();
  return d.getTime() < now.getTime();
};

export const fullName = (c?: { firstName: string; lastName: string | null } | null) =>
  c ? `${c.firstName}${c.lastName ? " " + c.lastName : ""}` : "—";

export const initials = (name?: string | null) =>
  name
    ? name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()
    : "?";

// ---------- Etiquetas ----------

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  SALES_DIRECTOR: "Director comercial",
  SALES_REP: "Comercial",
};

export const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Baja", MEDIUM: "Media", HIGH: "Alta",
};

export const TRIGGER_LABELS: Record<string, string> = {
  DEAL_CREATED: "Se crea un negocio",
  DEAL_STAGE_CHANGED: "Un negocio cambia de etapa",
  DEAL_WON: "Un negocio pasa a Ganado",
  DEAL_LOST: "Un negocio pasa a Perdido",
};

export const ACTION_LABELS: Record<string, string> = {
  CREATE_TASK: "Crear una tarea",
  LOG_ACTIVITY: "Registrar una actividad",
  SEND_EMAIL: "Enviar un email (simulado)",
};

export const ACTIVITY_LABELS: Record<string, string> = {
  CALL: "Llamada", EMAIL: "Email", MEETING: "Reunión",
  NOTE: "Nota", SUPPORT: "Soporte", SYSTEM: "Sistema",
};

export const STATUS_LABELS: Record<DealStatus, string> = {
  OPEN: "Abierto", WON: "Ganado", LOST: "Perdido",
};
