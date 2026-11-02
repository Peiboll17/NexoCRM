"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
} from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api, fmtMoney, fmtDate, fullName, type SessionUser, type Stage, type DealCard, type CompanyRow, type ContactRow, type UserRow } from "@/lib/client";
import { UserAvatar } from "@/components/crm/shared";
import { useToast } from "@/hooks/use-toast";
import { KanbanSquare, Plus, GripVertical, Trash2, Pencil, TrendingUp } from "lucide-react";

type DealForm = {
  title: string; amount: string; stageId: string; companyId: string;
  contactId: string; expectedCloseDate: string; source: string; ownerId: string;
};

const emptyForm = (stageId: string): DealForm => ({
  title: "", amount: "", stageId, companyId: "none", contactId: "none",
  expectedCloseDate: "", source: "", ownerId: "none",
});

export function PipelineView({ user, reloadSignal }: { user: SessionUser; reloadSignal: number }) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [deals, setDeals] = useState<DealCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DealCard | null>(null);
  const [form, setForm] = useState<DealForm>(emptyForm(""));
  const [saving, setSaving] = useState(false);

  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);

  const { toast } = useToast();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const load = () => {
    api<{ stages: Stage[]; deals: DealCard[] }>("/api/pipelines")
      .then(({ stages, deals }) => { setStages(stages); setDeals(deals); })
      .catch((e) => toast({ title: "Error cargando el embudo", description: e instanceof Error ? e.message : "", variant: "destructive" }))
      .finally(() => setLoading(false));
  };
  useEffect(load, [reloadSignal]);

  const loadFormOptions = () => {
    api<{ companies: CompanyRow[] }>("/api/companies").then((d) => setCompanies(d.companies)).catch(() => {});
    api<{ contacts: ContactRow[] }>("/api/contacts").then((d) => setContacts(d.contacts)).catch(() => {});
    if (user.role !== "SALES_REP") {
      api<{ users: UserRow[] }>("/api/users").then((d) => setUsers(d.users)).catch(() => {});
    }
  };

  const openStages = useMemo(() => stages.filter((s) => !s.isWon && !s.isLost), [stages]);
  const openDeals = useMemo(() => deals.filter((d) => d.status === "OPEN"), [deals]);
  const weightedTotal = useMemo(
    () => openDeals.reduce((s, d) => s + (d.amount * (d.stage?.probability ?? 0)) / 100, 0),
    [openDeals]
  );

  const openNewDialog = () => {
    loadFormOptions();
    setEditing(null);
    setForm(emptyForm(openStages[0]?.id ?? ""));
    setDialogOpen(true);
  };

  const openEditDialog = (deal: DealCard) => {
    loadFormOptions();
    setEditing(deal);
    setForm({
      title: deal.title,
      amount: String(deal.amount),
      stageId: deal.stage?.id ?? "",
      companyId: deal.company?.id ?? "none",
      contactId: deal.contact?.id ?? "none",
      expectedCloseDate: deal.expectedCloseDate ? deal.expectedCloseDate.slice(0, 10) : "",
      source: deal.source ?? "",
      ownerId: deal.owner?.id ?? "none",
    });
    setDialogOpen(true);
  };

  const saveDeal = async () => {
    if (!form.title.trim()) { toast({ title: "El título es obligatorio", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        amount: Number(form.amount) || 0,
        stageId: form.stageId || undefined,
        companyId: form.companyId === "none" ? null : form.companyId,
        contactId: form.contactId === "none" ? null : form.contactId,
        expectedCloseDate: form.expectedCloseDate || null,
        source: form.source.trim() || null,
        ownerId: form.ownerId === "none" ? undefined : form.ownerId,
      };
      if (editing) {
        await api(`/api/deals/${editing.id}`, { method: "PATCH", json: payload });
        toast({ title: "Negocio actualizado" });
      } else {
        const res = await api<{ automationMessages: string[] }>("/api/deals", { method: "POST", json: payload });
        toast({ title: "Negocio creado", description: res.automationMessages?.join("\n") || undefined });
      }
      setDialogOpen(false);
      load();
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteDeal = async (deal: DealCard) => {
    if (!confirm(`¿Eliminar el negocio "${deal.title}"? Se borrará también su historial.`)) return;
    try {
      await api(`/api/deals/${deal.id}`, { method: "DELETE" });
      setDeals((prev) => prev.filter((d) => d.id !== deal.id));
      toast({ title: "Negocio eliminado" });
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  const onDragStart = (e: DragStartEvent) => setDragId(String(e.active.id));

  const onDragEnd = async (e: DragEndEvent) => {
    setDragId(null);
    const dealId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;
    const deal = deals.find((d) => d.id === dealId);
    const target = stages.find((s) => s.id === overId);
    if (!deal || !target || deal.stage?.id === target.id) return;

    const previous = deals;
    // Optimista
    setDeals((prev) =>
      prev.map((d) => (d.id === dealId ? { ...d, stage: target, status: target.isWon ? "WON" : target.isLost ? "LOST" : "OPEN" } : d))
    );
    try {
      const res = await api<{ automationMessages: string[] }>(`/api/deals/${dealId}`, {
        method: "PATCH",
        json: { stageId: target.id },
      });
      if (target.isWon) {
        toast({
          title: "🎉 ¡Trato ganado!",
          description: res.automationMessages?.join("\n") || "Enhorabuena",
          duration: 6000,
        });
      } else if (target.isLost) {
        toast({ title: "Trato marcado como perdido", description: res.automationMessages?.join("\n") || undefined });
      } else {
        toast({
          title: `Movido a «${target.name}»`,
          description: res.automationMessages?.length ? res.automationMessages.join("\n") : undefined,
        });
      }
    } catch (err) {
      setDeals(previous);
      toast({ title: "No se pudo mover", description: err instanceof Error ? err.message : "", variant: "destructive" });
    }
  };

  if (loading) return <div className="grid gap-4 grid-flow-col auto-cols-[280px]">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-96 rounded-xl" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <KanbanSquare className="h-5 w-5 text-emerald-600" /> Pipeline comercial
          </h2>
          <p className="text-sm text-slate-500 flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            Previsión ponderada: <strong className="text-emerald-700">{fmtMoney(weightedTotal)}</strong>
            <span className="text-slate-400">· arrastra una tarjeta para cambiar de etapa</span>
          </p>
        </div>
        <Button onClick={openNewDialog} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4 mr-1" /> Nuevo negocio
        </Button>
      </div>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-1 px-1">
          {stages.map((stage) => (
            <PipelineColumn
              key={stage.id}
              stage={stage}
              deals={deals.filter((d) => (stage.isWon ? d.status === "WON" : stage.isLost ? d.status === "LOST" : d.status === "OPEN" && d.stage?.id === stage.id))}
              onEdit={openEditDialog}
              onDelete={deleteDeal}
              isManager={user.role !== "SALES_REP"}
            />
          ))}
        </div>
        <DragOverlay>
          {dragId ? (() => {
            const deal = deals.find((d) => d.id === dragId);
            return deal ? (
              <div className="w-[260px] rotate-2">
                <DealCardItem deal={deal} onEdit={() => {}} onDelete={() => {}} isManager={false} dragging />
              </div>
            ) : null;
          })() : null}
        </DragOverlay>
      </DndContext>

      {/* Dialogo crear / editar negocio */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar negocio" : "Nuevo negocio"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input placeholder="Ej: Licencias CRM — 25 usuarios" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Importe (€)</Label>
                <Input type="number" min="0" placeholder="12000" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Etapa</Label>
                <Select value={form.stageId} onValueChange={(v) => setForm({ ...form, stageId: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(editing ? stages : openStages).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name} ({s.probability}%)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Empresa</Label>
                <Select value={form.companyId} onValueChange={(v) => setForm({ ...form, companyId: v, contactId: "none" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sin empresa —</SelectItem>
                    {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Contacto principal</Label>
                <Select value={form.contactId} onValueChange={(v) => setForm({ ...form, contactId: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sin contacto —</SelectItem>
                    {contacts
                      .filter((c) => form.companyId === "none" || c.company?.id === form.companyId)
                      .map((c) => <SelectItem key={c.id} value={c.id}>{fullName(c)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Cierre estimado</Label>
                <Input type="date" value={form.expectedCloseDate} onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Origen</Label>
                <Input placeholder="Web, feria, referido…" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
              </div>
            </div>
            {user.role !== "SALES_REP" && (
              <div className="space-y-1.5">
                <Label>Propietario</Label>
                <Select value={form.ownerId} onValueChange={(v) => setForm({ ...form, ownerId: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveDeal} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear negocio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PipelineColumn({
  stage, deals, onEdit, onDelete, isManager,
}: {
  stage: Stage;
  deals: DealCard[];
  onEdit: (d: DealCard) => void;
  onDelete: (d: DealCard) => void;
  isManager: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = deals.reduce((s, d) => s + d.amount, 0);
  const weighted = deals.reduce((s, d) => s + (d.amount * stage.probability) / 100, 0);

  return (
    <div
      ref={setNodeRef}
      className={`flex min-w-[280px] max-w-[280px] flex-1 flex-col rounded-xl border bg-slate-50 transition-colors ${
        isOver ? "border-emerald-400 bg-emerald-50/70" : "border-slate-200"
      }`}
    >
      <div className="rounded-t-xl px-3 py-3" style={{ backgroundColor: `${stage.color}14` }}>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
            {stage.name}
          </span>
          <Badge variant="secondary" className="bg-white/70 text-slate-600">{deals.length}</Badge>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {fmtMoney(total)}
          {!stage.isWon && !stage.isLost && (
            <span className="text-emerald-600 font-medium"> · ponder. {fmtMoney(weighted)}</span>
          )}
          {!stage.isWon && !stage.isLost && <span className="text-slate-400"> ({stage.probability}%)</span>}
        </p>
      </div>
      <div className="flex max-h-[calc(100vh-260px)] min-h-[80px] flex-col gap-2 overflow-y-auto p-2">
        {deals.length === 0 && (
          <p className="py-6 text-center text-xs text-slate-400">
            {stage.isWon ? "Aún sin victorias" : stage.isLost ? "Nada perdido" : "Suelta aquí un negocio"}
          </p>
        )}
        {deals.map((deal) => (
          <DraggableDeal key={deal.id} deal={deal} onEdit={onEdit} onDelete={onDelete} isManager={isManager} />
        ))}
      </div>
    </div>
  );
}

function DraggableDeal(props: { deal: DealCard; onEdit: (d: DealCard) => void; onDelete: (d: DealCard) => void; isManager: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: props.deal.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={isDragging ? "opacity-30" : ""}>
      <DealCardItem {...props} />
    </div>
  );
}

function DealCardItem({
  deal, onEdit, onDelete, isManager, dragging = false,
}: {
  deal: DealCard; onEdit: (d: DealCard) => void; onDelete: (d: DealCard) => void; isManager: boolean; dragging?: boolean;
}) {
  const weighted = (deal.amount * (deal.stage?.probability ?? 0)) / 100;
  const overdue = deal.expectedCloseDate && new Date(deal.expectedCloseDate) < new Date() && deal.status === "OPEN";
  return (
    <Card className={`group cursor-grab rounded-lg p-0 shadow-sm transition hover:shadow-md active:cursor-grabbing ${dragging ? "shadow-lg" : ""}`}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-1">
          <p className="text-sm font-semibold leading-snug text-slate-800">{deal.title}</p>
          <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {deal.company?.name ?? "—"}
          {deal.contact ? ` · ${fullName(deal.contact)}` : ""}
        </p>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-sm font-bold text-slate-900">{fmtMoney(deal.amount)}</span>
          {deal.status === "OPEN" && (
            <span className="text-[11px] font-medium text-emerald-600">ponder. {fmtMoney(weighted)}</span>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <UserAvatar name={deal.owner?.name} className="h-5 w-5" />
            <span>{deal.owner?.name?.split(" ")[0] ?? "—"}</span>
            {deal.expectedCloseDate && (
              <span className={overdue ? "font-semibold text-rose-600" : ""}>
                · {deal.status === "OPEN" ? fmtDate(deal.expectedCloseDate) : `cerrado ${fmtDate(deal.closedAt)}`}
              </span>
            )}
          </div>
          {dragging ? null : (
            <div className={`flex gap-1 ${isManager ? "" : "opacity-0 group-hover:opacity-100"} transition-opacity`}>
              <button aria-label="Editar" onClick={(e) => { e.stopPropagation(); onEdit(deal); }} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button aria-label="Eliminar" onClick={(e) => { e.stopPropagation(); onDelete(deal); }} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
