"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, fmtDateTime, TRIGGER_LABELS, ACTION_LABELS, type AutomationRuleRow, type AutomationLogRow, type Stage } from "@/lib/client";
import { useToast } from "@/hooks/use-toast";
import { Workflow, Plus, Trash2, Zap, ArrowRight, History, Cog } from "lucide-react";

type RuleForm = {
  name: string; trigger: string; triggerStage: string; actionType: string;
  taskTitle: string; taskDays: string; taskPriority: string; assigneeMode: string;
  subject: string; description: string;
  emailSubject: string; emailBody: string;
};

const emptyRule: RuleForm = {
  name: "", trigger: "DEAL_WON", triggerStage: "none", actionType: "CREATE_TASK",
  taskTitle: "Onboarding del cliente: {negocio}", taskDays: "2", taskPriority: "HIGH", assigneeMode: "DEAL_OWNER",
  subject: "Actualización: {negocio}", description: "El negocio \"{negocio}\" ({monto}) pasó a \"{etapa}\".",
  emailSubject: "¡Bienvenido/a! Tu proyecto {negocio} ya está en marcha",
  emailBody: "Hola {contacto}: gracias por confiar en nosotros. Tu proyecto {negocio} ({monto}) ya está en marcha.",
};

export function AutomationsView({ reloadSignal }: { user: import("@/lib/client").SessionUser; reloadSignal: number }) {
  const [rules, setRules] = useState<AutomationRuleRow[]>([]);
  const [logs, setLogs] = useState<AutomationLogRow[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<RuleForm>(emptyRule);
  const { toast } = useToast();

  const load = () => {
    Promise.all([
      api<{ rules: AutomationRuleRow[] }>("/api/automations"),
      api<{ logs: AutomationLogRow[] }>("/api/automations/logs"),
      api<{ stages: Stage[] }>("/api/pipelines").catch(() => ({ stages: [] })),
    ])
      .then(([r, l, s]) => { setRules(r.rules); setLogs(l.logs); setStages(s.stages); })
      .catch((e) => toast({ title: "Error", description: e instanceof Error ? e.message : "", variant: "destructive" }))
      .finally(() => setLoading(false));
  };
  useEffect(load, [reloadSignal]);

  const toggleActive = async (rule: AutomationRuleRow) => {
    try {
      const res = await api<{ rule: AutomationRuleRow }>(`/api/automations/${rule.id}`, { method: "PATCH", json: { active: !rule.active } });
      setRules((prev) => prev.map((x) => (x.id === rule.id ? res.rule : x)));
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  const remove = async (rule: AutomationRuleRow) => {
    if (!confirm(`¿Eliminar la regla "${rule.name}"?`)) return;
    try {
      await api(`/api/automations/${rule.id}`, { method: "DELETE" });
      setRules((prev) => prev.filter((x) => x.id !== rule.id));
      toast({ title: "Regla eliminada" });
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  const create = async () => {
    if (!form.name.trim()) { toast({ title: "El nombre es obligatorio", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const actionConfig =
        form.actionType === "CREATE_TASK"
          ? { title: form.taskTitle, days: Number(form.taskDays) || 3, priority: form.taskPriority, assigneeMode: form.assigneeMode }
          : form.actionType === "LOG_ACTIVITY"
            ? { subject: form.subject, description: form.description, activityType: "SYSTEM" }
            : { emailSubject: form.emailSubject, emailBody: form.emailBody };
      await api("/api/automations", {
        method: "POST",
        json: {
          name: form.name.trim(), trigger: form.trigger,
          triggerStage: form.trigger === "DEAL_STAGE_CHANGED" && form.triggerStage !== "none" ? form.triggerStage : null,
          actionType: form.actionType, actionConfig,
        },
      });
      toast({ title: "Regla creada", description: "Se ejecutará en cuanto ocurra el gatillo." });
      setOpen(false);
      setForm(emptyRule);
      load();
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Workflow className="h-5 w-5 text-emerald-600" /> Automatizaciones</h2>
          <p className="text-sm text-slate-500">Gatillos y acciones event-driven: el motor se ejecuta en el servidor cuando ocurre el evento.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="h-4 w-4 mr-1" /> Nueva regla</Button>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : (
        <div className="space-y-3">
          {rules.length === 0 && <p className="rounded-xl border bg-white py-10 text-center text-sm text-slate-500">Aún no hay reglas. Crea la primera.</p>}
          {rules.map((rule) => {
            const cfg: Record<string, unknown> = safeParse(rule.actionConfig);
            return (
              <div key={rule.id} className="rounded-xl border bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Cog className={`h-4 w-4 ${rule.active ? "text-emerald-600" : "text-slate-300"}`} />
                      <p className="text-sm font-semibold text-slate-800">{rule.name}</p>
                      {rule.triggerStage && <Badge variant="outline" className="text-[10px]">→ {rule.triggerStage}</Badge>}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                      <Badge className="bg-violet-100 text-violet-700 hover:bg-violet-100 font-normal">
                        <Zap className="mr-1 h-3 w-3" /> {TRIGGER_LABELS[rule.trigger] ?? rule.trigger}
                      </Badge>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 font-normal">
                        {ACTION_LABELS[rule.actionType] ?? rule.actionType}
                      </Badge>
                      {rule.actionType === "CREATE_TASK" && (
                        <span className="text-slate-500">
                          «{String(cfg.title ?? "")}» · en {String(cfg.days ?? "?")} días · prioridad {String(cfg.priority ?? "?")}
                        </span>
                      )}
                      {rule.actionType === "SEND_EMAIL" && (
                        <span className="text-slate-500 truncate max-w-md">«{String(cfg.emailSubject ?? "")}»</span>
                      )}
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-400">{rule._count.logs} ejecución(ones) registradas</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500">{rule.active ? "Activa" : "Pausada"}</span>
                      <Switch checked={rule.active} onCheckedChange={() => toggleActive(rule)} />
                    </div>
                    <button aria-label="Eliminar regla" onClick={() => remove(rule)} className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Registro de auditoría */}
      <div>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <History className="h-4 w-4 text-slate-500" /> Registro de ejecución (últimas 50)
        </h3>
        <div className="max-h-72 space-y-1.5 overflow-y-auto rounded-xl border bg-white p-3">
          {logs.length === 0 && <p className="py-6 text-center text-xs text-slate-400">El motor aún no ha ejecutado ninguna regla. Mueve un negocio a «Ganado» para verlo en acción.</p>}
          {logs.map((l) => (
            <div key={l.id} className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
              <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              <div className="min-w-0">
                <p className="text-slate-700">{l.message}</p>
                <p className="text-[10px] text-slate-400">{l.rule?.name ?? "—"} · {fmtDateTime(l.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dialogo nueva regla */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nueva regla de automatización</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Nombre de la regla *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Ganado → onboarding + email" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Cuando (gatillo) *</Label>
                <Select value={form.trigger} onValueChange={(v) => setForm({ ...form, trigger: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TRIGGER_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {form.trigger === "DEAL_STAGE_CHANGED" && (
                <div className="space-y-1.5">
                  <Label>Etapa destino</Label>
                  <Select value={form.triggerStage} onValueChange={(v) => setForm({ ...form, triggerStage: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Cualquier etapa</SelectItem>
                      {stages.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Entonces (acción) *</Label>
              <Select value={form.actionType} onValueChange={(v) => setForm({ ...form, actionType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ACTION_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {form.actionType === "CREATE_TASK" && (
              <div className="space-y-3 rounded-lg bg-slate-50 p-3">
                <div className="space-y-1.5">
                  <Label>Título de la tarea</Label>
                  <Input value={form.taskTitle} onChange={(e) => setForm({ ...form, taskTitle: e.target.value })} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Vence en (días)</Label>
                    <Input type="number" min="0" value={form.taskDays} onChange={(e) => setForm({ ...form, taskDays: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Prioridad</Label>
                    <Select value={form.taskPriority} onValueChange={(v) => setForm({ ...form, taskPriority: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{["LOW", "MEDIUM", "HIGH"].map((p) => <SelectItem key={p} value={p}>{p === "LOW" ? "Baja" : p === "MEDIUM" ? "Media" : "Alta"}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Asignar a</Label>
                    <Select value={form.assigneeMode} onValueChange={(v) => setForm({ ...form, assigneeMode: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DEAL_OWNER">Propietario del negocio</SelectItem>
                        <SelectItem value="ADMIN">Administrador</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
            {form.actionType === "LOG_ACTIVITY" && (
              <div className="space-y-3 rounded-lg bg-slate-50 p-3">
                <div className="space-y-1.5">
                  <Label>Asunto de la actividad</Label>
                  <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Descripción</Label>
                  <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
              </div>
            )}
            {form.actionType === "SEND_EMAIL" && (
              <div className="space-y-3 rounded-lg bg-slate-50 p-3">
                <div className="space-y-1.5">
                  <Label>Asunto del email</Label>
                  <Input value={form.emailSubject} onChange={(e) => setForm({ ...form, emailSubject: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Cuerpo</Label>
                  <Textarea rows={3} value={form.emailBody} onChange={(e) => setForm({ ...form, emailBody: e.target.value })} />
                </div>
              </div>
            )}

            <p className="text-xs text-slate-400">
              Variables disponibles: <code>{"{negocio}"}</code> <code>{"{contacto}"}</code> <code>{"{empresa}"}</code> <code>{"{etapa}"}</code> <code>{"{monto}"}</code>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={create} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? "Creando…" : "Crear regla"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function safeParse(s: string): Record<string, unknown> {
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return {}; }
}
