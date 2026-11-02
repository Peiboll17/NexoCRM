"use client";

// ============================================================
// Campana de alertas in-app
// - Al abrir el CRM consulta /api/alerts, que dispara la comprobación
//   de la alerta semanal automática (1 por semana ISO, lazy cron).
// - Bandeja: ranking semanal del equipo (rico, desde payload JSON),
//   marcar todo como leído y, para dirección, regenerar la alerta.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { api, fmtDateTime, type SessionUser, type NotificationRow } from "@/lib/client";
import { UserAvatar } from "@/components/crm/shared";
import { useToast } from "@/hooks/use-toast";
import {
  Bell, Trophy, CheckCheck, Send, Medal, Crown,
} from "lucide-react";

type WeeklyRankingPayloadRow = {
  userId: string;
  name: string;
  wonValue: number;
  wonCount: number;
  weeklyTarget: number | null;
  compliance: number | null;
};

type WeeklyRankingPayload = {
  weekStart: string;
  weekEnd: string;
  teamWonValue: number;
  ranking: WeeklyRankingPayloadRow[];
};

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

const complianceCls = (pct: number) =>
  pct >= 100 ? "text-emerald-600" : pct >= 70 ? "text-amber-600" : "text-rose-600";

function parsePayload(n: NotificationRow): WeeklyRankingPayload | null {
  if (n.type !== "WEEKLY_RANKING") return null;
  try {
    const p = JSON.parse(n.payload) as WeeklyRankingPayload;
    return Array.isArray(p.ranking) ? p : null;
  } catch {
    return null;
  }
}

export function NotificationsBell({ user, reloadSignal }: { user: SessionUser; reloadSignal: number }) {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const { toast } = useToast();
  const isManager = user.role === "ADMIN" || user.role === "SALES_DIRECTOR";

  const load = useCallback(() => {
    api<{ notifications: NotificationRow[]; unreadCount: number }>("/api/alerts")
      .then((d) => {
        setItems(d.notifications);
        setUnread(d.unreadCount);
      })
      .catch(() => {
        // silencioso: la campana no debe molestar por un fallo puntual
      });
  }, []);

  useEffect(load, [load, reloadSignal]);

  const markAllRead = async () => {
    try {
      await api("/api/alerts/read", { method: "POST" });
      setUnread(0);
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  const sendWeeklyNow = async () => {
    setSending(true);
    try {
      const r = await api<{ recipients: number }>("/api/alerts/weekly", { method: "POST" });
      toast({
        title: "Alerta semanal enviada",
        description: `Ranking regenerado y entregado a ${r.recipients} usuario(s).`,
      });
      load();
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative h-10 w-10 rounded-full bg-white" aria-label={`Alertas (${unread} sin leer)`}>
          <Bell className="h-4.5 w-4.5 text-slate-600" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0 sm:w-96">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Bell className="h-4 w-4 text-emerald-600" /> Alertas
            {unread > 0 && <span className="text-xs font-normal text-rose-500">{unread} sin leer</span>}
          </p>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-slate-500" onClick={markAllRead}>
              <CheckCheck className="h-3.5 w-3.5 mr-1" /> Marcar leídas
            </Button>
          )}
        </div>
        <Separator />
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400">Sin alertas por ahora.</p>
        ) : (
          <ScrollArea className="max-h-96">
            <ul className="divide-y divide-slate-100">
              {items.map((n) => {
                const weekly = parsePayload(n);
                return (
                  <li key={n.id} className={`px-4 py-3 ${n.readAt ? "" : "bg-emerald-50/40"}`}>
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
                        <Trophy className="h-4 w-4 text-amber-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-snug text-slate-800">{n.title}</p>
                        <p className="mt-0.5 whitespace-pre-line text-xs leading-relaxed text-slate-500">{n.body}</p>

                        {/* Ranking semanal detallado */}
                        {weekly && (
                          <ol className="mt-2 space-y-1.5 rounded-lg border border-slate-100 bg-white p-2">
                            {weekly.ranking.map((r, i) => (
                              <li key={r.userId} className={`flex items-center gap-2 rounded px-1 py-0.5 text-xs ${r.userId === user.id ? "bg-emerald-50" : ""}`}>
                                <span className="w-6 shrink-0 font-semibold text-slate-500">
                                  {i === 0 ? <Crown className="inline h-3.5 w-3.5 text-amber-500" /> : i <= 2 ? <Medal className="inline h-3.5 w-3.5 text-slate-400" /> : `${i + 1}.`}
                                </span>
                                <UserAvatar name={r.name} className="h-5 w-5" />
                                <span className="min-w-0 flex-1 truncate font-medium text-slate-700">
                                  {r.name}{r.userId === user.id && <span className="ml-1 text-emerald-600">(tú)</span>}
                                </span>
                                <span className="shrink-0 font-semibold text-emerald-700">{fmtEUR(r.wonValue)}</span>
                                <span className={`w-12 shrink-0 text-right font-medium ${r.compliance !== null ? complianceCls(r.compliance) : "text-slate-300"}`}>
                                  {r.compliance !== null ? `${r.compliance}%` : "—"}
                                </span>
                              </li>
                            ))}
                          </ol>
                        )}

                        <p className="mt-1 text-[11px] text-slate-400">
                          {fmtDateTime(n.createdAt)}{n.readAt ? "" : " · nuevo"}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
        {isManager && (
          <>
            <Separator />
            <div className="p-3">
              <Button
                onClick={sendWeeklyNow}
                disabled={sending}
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                size="sm"
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                {sending ? "Enviando…" : "Generar alerta semanal ahora"}
              </Button>
              <p className="mt-1.5 text-center text-[11px] text-slate-400">
                Se envía sola cada lunes; úsalo para reenviar o probar.
              </p>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
