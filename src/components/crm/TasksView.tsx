"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, fmtDate, relativeDays, isOverdue, fullName, PRIORITY_LABELS, type SessionUser, type TaskRow, type UserRow, type ContactRow, type DealCard } from "@/lib/client";
import { useToast } from "@/hooks/use-toast";
import { ListChecks, Plus, Trash2, AlertTriangle } from "lucide-react";

type Filter = "PENDIENTES" | "VENCIDAS" | "HOY" | "TODAS" | "COMPLETADAS";

export function TasksView({ user, reloadSignal }: { user: SessionUser; reloadSignal: number }) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [deals, setDeals] = useState<DealCard[]>([]);
  const [filter, setFilter] = useState<Filter>("PENDIENTES");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", dueDate: "", priority: "MEDIUM", assignedToId: "me", contactId: "none", dealId: "none" });
  const { toast } = useToast();

  const load = () => {
    Promise.all([
      api<{ tasks: TaskRow[] }>("/api/tasks"),
      api<{ contacts: ContactRow[] }>("/api/contacts").catch(() => ({ contacts: [] })),
      api<{ deals: DealCard[] }>("/api/deals").catch(() => ({ deals: [] })),
      user.role !== "SALES_REP" ? api<{ users: UserRow[] }>("/api/users").catch(() => ({ users: [] })) : Promise.resolve({ users: [] }),
    ])
      .then(([t, c, d, u]) => { setTasks(t.tasks); setContacts(c.contacts); setDeals(d.deals); setUsers(u.users); })
      .catch((e) => toast({ title: "Error cargando tareas", description: e instanceof Error ? e.message : "", variant: "destructive" }))
      .finally(() => setLoading(false));
  };
  useEffect(load, [reloadSignal]);

  const now = new Date();
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

  const counts = useMemo(() => ({
    PENDIENTES: tasks.filter((t) => t.status === "PENDING").length,
    VENCIDAS: tasks.filter((t) => t.status === "PENDING" && t.dueDate && isOverdue(t.dueDate)).length,
    HOY: tasks.filter((t) => t.status === "PENDING" && t.dueDate && new Date(t.dueDate) <= todayEnd).length,
    TODAS: tasks.length,
    COMPLETADAS: tasks.filter((t) => t.status === "DONE").length,
  }), [tasks]);

  const filtered = useMemo(() => {
    const sorted = [...tasks].sort((a, b) => {
      if (a.status !== b.status) return a.status === "PENDING" ? -1 : 1;
      const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return ad - bd;
    });
    switch (filter) {
      case "PENDIENTES": return sorted.filter((t) => t.status === "PENDING");
      case "VENCIDAS": return sorted.filter((t) => t.status === "PENDING" && t.dueDate && isOverdue(t.dueDate));
      case "HOY": return sorted.filter((t) => t.status === "PENDING" && t.dueDate && new Date(t.dueDate) <= todayEnd);
      case "COMPLETADAS": return sorted.filter((t) => t.status === "DONE");
      default: return sorted;
    }
  }, [tasks, filter]);

  const toggle = async (t: TaskRow) => {
    try {
      await api(`/api/tasks/${t.id}`, { method: "PATCH", json: { status: t.status === "DONE" ? "PENDING" : "DONE" } });
      setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: x.status === "DONE" ? "PENDING" : "DONE" } : x)));
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  const remove = async (t: TaskRow) => {
    try {
      await api(`/api/tasks/${t.id}`, { method: "DELETE" });
      setTasks((prev) => prev.filter((x) => x.id !== t.id));
      toast({ title: "Tarea eliminada" });
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  const create = async () => {
    if (!form.title.trim()) { toast({ title: "El título es obligatorio", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await api("/api/tasks", {
        method: "POST",
        json: {
          title: form.title.trim(), description: form.description.trim() || null,
          dueDate: form.dueDate || null, priority: form.priority,
          assignedToId: form.assignedToId === "me" ? user.id : form.assignedToId,
          contactId: form.contactId === "none" ? null : form.contactId,
          dealId: form.dealId === "none" ? null : form.dealId,
        },
      });
      toast({ title: "Tarea creada" });
      setOpen(false);
      setForm({ title: "", description: "", dueDate: "", priority: "MEDIUM", assignedToId: "me", contactId: "none", dealId: "none" });
      load();
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const FILTERS: Filter[] = ["PENDIENTES", "VENCIDAS", "HOY", "TODAS", "COMPLETADAS"];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><ListChecks className="h-5 w-5 text-emerald-600" /> Tareas</h2>
          <p className="text-sm text-slate-500">{counts.VENCIDAS} vencidas · {counts.HOY} para hoy · {counts.PENDIENTES} abiertas</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="h-4 w-4 mr-1" /> Nueva tarea</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
              filter === f ? "bg-emerald-600 text-white" : "bg-white text-slate-600 border hover:border-emerald-300"
            }`}>
            {f.charAt(0) + f.slice(1).toLowerCase()} ({counts[f]})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      ) : (
        <div className="space-y-2">
          {filtered.length === 0 && (
            <p className="rounded-xl border bg-white py-10 text-center text-sm text-slate-500">
              {filter === "VENCIDAS" ? "Nada vencido. ¡Buen trabajo! 🎉" : "Sin tareas en esta vista."}
            </p>
          )}
          {filtered.map((t) => {
            const overdue = t.status === "PENDING" && t.dueDate && isOverdue(t.dueDate);
            const isToday = t.status === "PENDING" && t.dueDate && new Date(t.dueDate) <= todayEnd;
            return (
              <div key={t.id} className={`group flex items-start gap-3 rounded-xl border bg-white p-3.5 transition hover:shadow-sm ${overdue ? "border-rose-200" : ""}`}>
                <Checkbox className="mt-1" checked={t.status === "DONE"} onCheckedChange={() => toggle(t)} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${t.status === "DONE" ? "text-slate-400 line-through" : "text-slate-800"}`}>{t.title}</p>
                  {t.description && <p className="mt-0.5 text-xs text-slate-500">{t.description}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <Badge variant={t.priority === "HIGH" ? "destructive" : "secondary"} className="h-5 px-1.5 text-[10px]">
                      {PRIORITY_LABELS[t.priority]}
                    </Badge>
                    {t.dueDate && (
                      <span className={overdue ? "font-semibold text-rose-600" : isToday ? "font-semibold text-amber-600" : "text-slate-500"}>
                        {overdue && <AlertTriangle className="mr-0.5 inline h-3 w-3" />}
                        {overdue ? "vencida" : "vence"} {relativeDays(t.dueDate)} · {fmtDate(t.dueDate)}
                      </span>
                    )}
                    {t.assignedTo && <span className="text-slate-400">👤 {t.assignedTo.name}</span>}
                    {t.contact && <span className="text-slate-400">· {fullName(t.contact)}</span>}
                    {t.deal && <span className="text-slate-400">· {t.deal.title}</span>}
                  </div>
                </div>
                <button aria-label="Eliminar tarea" onClick={() => remove(t)} className="rounded p-1.5 text-slate-300 opacity-0 transition group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nueva tarea</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ej: Llamar a Bruno para cerrar fecha de demo" />
            </div>
            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Fecha límite</Label>
                <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Prioridad</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(PRIORITY_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {user.role !== "SALES_REP" && (
              <div className="space-y-1.5">
                <Label>Responsable</Label>
                <Select value={form.assignedToId} onValueChange={(v) => setForm({ ...form, assignedToId: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="me">Yo mismo</SelectItem>
                    {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Contacto</Label>
                <Select value={form.contactId} onValueChange={(v) => setForm({ ...form, contactId: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Ninguno —</SelectItem>
                    {contacts.map((c) => <SelectItem key={c.id} value={c.id}>{fullName(c)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Negocio</Label>
                <Select value={form.dealId} onValueChange={(v) => setForm({ ...form, dealId: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Ninguno —</SelectItem>
                    {deals.filter((d) => d.status === "OPEN").map((d) => <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={create} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? "Creando…" : "Crear tarea"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
