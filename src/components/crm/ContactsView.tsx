"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api, fmtMoney, fmtDate, fmtDateTime, relativeDays, isOverdue, fullName, PRIORITY_LABELS, type SessionUser, type ContactRow, type ContactDetail, type CompanyRow, type ActivityRow, type TaskRow, type DealCard } from "@/lib/client";
import { ActivityIcon, UserAvatar } from "@/components/crm/shared";
import { useToast } from "@/hooks/use-toast";
import {
  Phone, Mail, CalendarDays, StickyNote, Users as UsersIcon, Search, Plus,
  Trash2, Pencil, Building2, Loader2,
} from "lucide-react";

type ContactForm = {
  firstName: string; lastName: string; email: string; phone: string;
  position: string; companyId: string; notes: string;
};
const emptyContact: ContactForm = { firstName: "", lastName: "", email: "", phone: "", position: "", companyId: "none", notes: "" };

export function ContactsView({ user, reloadSignal }: { user: SessionUser; reloadSignal: number }) {
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ContactRow | null>(null);
  const [form, setForm] = useState<ContactForm>(emptyContact);
  const [saving, setSaving] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { toast } = useToast();

  const load = () => {
    Promise.all([
      api<{ contacts: ContactRow[] }>("/api/contacts"),
      api<{ companies: CompanyRow[] }>("/api/companies"),
    ])
      .then(([c, co]) => { setContacts(c.contacts); setCompanies(co.companies); })
      .catch((e) => toast({ title: "Error cargando contactos", description: e instanceof Error ? e.message : "", variant: "destructive" }))
      .finally(() => setLoading(false));
  };
  useEffect(load, [reloadSignal]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return contacts;
    return contacts.filter((c) =>
      [c.firstName, c.lastName, c.email, c.phone, c.position, c.company?.name]
        .join(" ").toLowerCase().includes(q)
    );
  }, [contacts, query]);

  const openNew = () => { setEditing(null); setForm(emptyContact); setFormOpen(true); };
  const openEdit = (c: ContactRow) => {
    setEditing(c);
    setForm({
      firstName: c.firstName, lastName: c.lastName ?? "", email: c.email ?? "",
      phone: c.phone ?? "", position: c.position ?? "", companyId: c.company?.id ?? "none",
      notes: c.notes ?? "",
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.firstName.trim()) { toast({ title: "El nombre es obligatorio", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload = {
        firstName: form.firstName.trim(), lastName: form.lastName.trim() || null,
        email: form.email.trim() || null, phone: form.phone.trim() || null,
        position: form.position.trim() || null, notes: form.notes.trim() || null,
        companyId: form.companyId === "none" ? null : form.companyId,
      };
      if (editing) {
        await api(`/api/contacts/${editing.id}`, { method: "PATCH", json: payload });
        toast({ title: "Contacto actualizado" });
      } else {
        await api("/api/contacts", { method: "POST", json: payload });
        toast({ title: "Contacto creado", description: "Ya está disponible en tu cartera." });
      }
      setFormOpen(false);
      load();
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const remove = async (c: ContactRow) => {
    if (!confirm(`¿Eliminar a ${fullName(c)}? Se borrarán sus actividades y tareas.`)) return;
    try {
      await api(`/api/contacts/${c.id}`, { method: "DELETE" });
      setContacts((prev) => prev.filter((x) => x.id !== c.id));
      if (detailId === c.id) setDetailId(null);
      toast({ title: "Contacto eliminado" });
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <UsersIcon className="h-5 w-5 text-emerald-600" /> Contactos
          </h2>
          <p className="text-sm text-slate-500">
            {user.role === "SALES_REP" ? "Tu cartera" : "Toda la cartera del equipo"} · {contacts.length} contactos
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input placeholder="Buscar nombre, email, empresa…" className="pl-9 w-56 sm:w-72" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <Button onClick={openNew} className="bg-emerald-600 hover:bg-emerald-700 whitespace-nowrap">
            <Plus className="h-4 w-4 mr-1" /> Nuevo contacto
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-white">
        {loading ? (
          <div className="space-y-2 p-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Contacto</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="hidden md:table-cell">Puesto</TableHead>
                  <TableHead className="hidden lg:table-cell">Teléfono</TableHead>
                  <TableHead className="hidden sm:table-cell">Propietario</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">Sin resultados.</TableCell></TableRow>
                )}
                {filtered.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => setDetailId(c.id)}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <UserAvatar name={fullName(c)} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">{fullName(c)}</p>
                          <p className="truncate text-xs text-slate-500">{c.email ?? "sin email"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {c.company ? <Badge variant="outline" className="font-normal">{c.company.name}</Badge> : <span className="text-xs text-slate-400">—</span>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-slate-600">{c.position ?? "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-slate-600">{c.phone ?? "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-slate-600">{c.owner?.name ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button aria-label="Editar" onClick={() => openEdit(c)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><Pencil className="h-4 w-4" /></button>
                        <button aria-label="Eliminar" onClick={() => remove(c)} className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Dialogo crear/editar */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar contacto" : "Nuevo contacto"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nombre *</Label>
                <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Apellidos</Label>
                <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Teléfono</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Puesto</Label>
                <Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="CFO, Directora IT…" />
              </div>
              <div className="space-y-1.5">
                <Label>Empresa</Label>
                <Select value={form.companyId} onValueChange={(v) => setForm({ ...form, companyId: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sin empresa —</SelectItem>
                    {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Contexto, intereses, próximos pasos…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ficha 360º */}
      {detailId && (
        <ContactDetailSheet
          contactId={detailId}
          user={user}
          companies={companies}
          onClose={() => setDetailId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Ficha 360º del contacto: cronología omnicanal + negocios + tareas
// ------------------------------------------------------------

function ContactDetailSheet({
  contactId, user, companies, onClose, onChanged,
}: {
  contactId: string;
  user: SessionUser;
  companies: CompanyRow[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const { toast } = useToast();

  const load = () => {
    api<{ contact: ContactDetail }>(`/api/contacts/${contactId}`)
      .then((d) => setDetail(d.contact))
      .catch((e) => setError(e instanceof Error ? e.message : "Error"));
  };
  useEffect(load, [contactId]);

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Ficha del contacto</SheetTitle>
        </SheetHeader>
        {!detail ? (
          <div className="flex h-64 items-center justify-center text-sm text-slate-500">
            {error ? error : <Loader2 className="h-6 w-6 animate-spin" />}
          </div>
        ) : (
          <>
            <SheetHeader className="p-5 pb-3 border-b">
              <div className="flex items-start gap-3">
                <UserAvatar name={fullName(detail)} className="h-12 w-12" />
                <div className="min-w-0 flex-1">
                  <SheetTitle className="text-lg">{fullName(detail)}</SheetTitle>
                  <p className="text-sm text-slate-500">
                    {detail.position ?? "Sin puesto"} {detail.company ? `· ${detail.company.name}` : ""}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                    {detail.email && <a className="inline-flex items-center gap-1 hover:text-emerald-700" href={`mailto:${detail.email}`}><Mail className="h-3 w-3" />{detail.email}</a>}
                    {detail.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{detail.phone}</span>}
                    <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />Propietario: {detail.owner?.name ?? "—"}</span>
                  </div>
                </div>
              </div>
              {/* Registro en 2 clics — tasa de fricción baja */}
              <div className="mt-3 flex flex-wrap gap-2">
                <QuickLogButton label="Llamada" icon={<Phone className="h-3.5 w-3.5" />} onClick={() => setLogOpen(true)} />
                <QuickLogButton label="Email" icon={<Mail className="h-3.5 w-3.5" />} onClick={() => setLogOpen(true)} />
                <QuickLogButton label="Reunión" icon={<CalendarDays className="h-3.5 w-3.5" />} onClick={() => setLogOpen(true)} />
                <QuickLogButton label="Nota" icon={<StickyNote className="h-3.5 w-3.5" />} onClick={() => setLogOpen(true)} />
                <QuickLogButton label="Tarea" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setTaskOpen(true)} />
              </div>
            </SheetHeader>

            <div className="p-5">
              <Tabs defaultValue="timeline">
                <TabsList className="mb-4">
                  <TabsTrigger value="timeline">Cronología</TabsTrigger>
                  <TabsTrigger value="deals">Negocios ({detail.deals.length})</TabsTrigger>
                  <TabsTrigger value="tasks">Tareas ({detail.tasks.filter((t) => t.status === "PENDING").length})</TabsTrigger>
                  <TabsTrigger value="info">Datos</TabsTrigger>
                </TabsList>

                <TabsContent value="timeline" className="space-y-0">
                  {detail.activities.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-500">Sin interacciones registradas todavía. Usa los botones de arriba para añadir la primera en 2 clics.</p>
                  ) : (
                    <OmnichannelTimeline activities={detail.activities} />
                  )}
                </TabsContent>

                <TabsContent value="deals">
                  {detail.deals.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-500">Este contacto aún no tiene negocios. Créalos desde el Pipeline.</p>
                  ) : (
                    <div className="space-y-2">
                      {detail.deals.map((d: DealCard) => (
                        <div key={d.id} className="rounded-lg border p-3 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-800">{d.title}</p>
                            <p className="text-xs text-slate-500">
                              {d.stage?.name ?? "—"} · creado {fmtDate(d.createdAt)}
                              {d.expectedCloseDate ? ` · cierre ${fmtDate(d.expectedCloseDate)}` : ""}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold">{fmtMoney(d.amount)}</p>
                            <Badge variant={d.status === "WON" ? "default" : d.status === "LOST" ? "secondary" : "outline"}
                              className={d.status === "WON" ? "bg-emerald-600" : "text-[11px]"}>
                              {d.status === "WON" ? "Ganado" : d.status === "LOST" ? "Perdido" : "Abierto"}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="tasks">
                  <TasksMiniList tasks={detail.tasks} onChanged={load} />
                </TabsContent>

                <TabsContent value="info">
                  <p className="mb-3 whitespace-pre-wrap text-sm text-slate-600">{detail.notes || "Sin notas."}</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <InfoRow label="Empresa" value={detail.company?.name ?? "—"} />
                    <InfoRow label="Sector" value={detail.company?.sector ?? "—"} />
                    <InfoRow label="Alta en CRM" value={fmtDate(detail.createdAt)} />
                    <InfoRow label="Propietario" value={detail.owner?.name ?? "—"} />
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </SheetContent>

      {detail && (
        <>
          <LogActivityDialog open={logOpen} onOpenChange={setLogOpen} contactId={detail.id} onLogged={() => { load(); onChanged(); }} />
          <QuickTaskDialog open={taskOpen} onOpenChange={setTaskOpen} contactId={detail.id} contactName={fullName(detail)} userId={user.id} onCreated={() => { load(); onChanged(); }} />
        </>
      )}
    </Sheet>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm font-medium text-slate-700">{value}</p>
    </div>
  );
}

function QuickLogButton({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onClick}>
      {icon} {label}
    </Button>
  );
}

/** Línea temporal omnicanal: estrictamente cronológica, unificando canales. */
export function OmnichannelTimeline({ activities }: { activities: ActivityRow[] }) {
  const sorted = [...activities].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  );
  return (
    <div className="relative space-y-4 pl-2">
      <div className="absolute bottom-2 left-[15px] top-2 w-px bg-slate-200" aria-hidden />
      {sorted.map((a) => (
        <div key={a.id} className="relative flex gap-3">
          <div className="relative z-10"><ActivityIcon type={a.type} /></div>
          <div className="min-w-0 flex-1 rounded-lg border border-slate-100 bg-slate-50/60 p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <p className="text-sm font-medium text-slate-800">{a.subject}</p>
              <span className="text-[11px] text-slate-400">{fmtDateTime(a.occurredAt)} · {relativeDays(a.occurredAt)}</span>
            </div>
            {a.description && <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{a.description}</p>}
            <p className="mt-1 text-[11px] text-slate-400">
              {a.deal ? `Negocio: ${a.deal.title} · ` : ""}
              {a.user ? `registrado por ${a.user.name}` : "automático"}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Registrar actividad: 2 clics desde la ficha. */
function LogActivityDialog({
  open, onOpenChange, contactId, onLogged,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; contactId: string; onLogged: () => void;
}) {
  const [type, setType] = useState("CALL");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const submit = async (quick?: { type: string; subject: string }) => {
    const t = quick?.type ?? type;
    const s = (quick?.subject ?? subject).trim();
    if (!s) { toast({ title: "Escribe un asunto", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await api("/api/activities", {
        method: "POST",
        json: { type: t, subject: s, description: description.trim() || null, contactId },
      });
      toast({ title: "Interacción registrada" });
      setSubject(""); setDescription("");
      onOpenChange(false);
      onLogged();
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Registrar interacción</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="flex flex-wrap gap-2">
            {([["CALL", "Llamada", <Phone key="p" className="h-3.5 w-3.5" />], ["EMAIL", "Email", <Mail key="m" className="h-3.5 w-3.5" />], ["MEETING", "Reunión", <CalendarDays key="c" className="h-3.5 w-3.5" />], ["NOTE", "Nota", <StickyNote key="n" className="h-3.5 w-3.5" />]] as const).map(([val, label, icon]) => (
              <Button key={val} type="button" variant={type === val ? "default" : "outline"} size="sm"
                className={type === val ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                onClick={() => setType(val)}>
                {icon} {label}
              </Button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label>Asunto *</Label>
            <Input autoFocus value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ej: Llamada de seguimiento (15 min)" />
          </div>
          <div className="space-y-1.5">
            <Label>Detalles</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Resumen de la conversación…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => submit()} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Guardando…" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Crear tarea rápida desde la ficha. */
function QuickTaskDialog({
  open, onOpenChange, contactId, contactName, userId, onCreated,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; contactId: string;
  contactName: string; userId: string; onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const submit = async () => {
    if (!title.trim()) { toast({ title: "El título es obligatorio", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await api("/api/tasks", {
        method: "POST",
        json: { title: title.trim(), priority, dueDate: dueDate || null, contactId, assignedToId: userId },
      });
      toast({ title: "Tarea creada" });
      setTitle(""); setDueDate(""); setPriority("MEDIUM");
      onOpenChange(false);
      onCreated();
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Nueva tarea — {contactName}</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Enviar propuesta revisada" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Fecha límite</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Prioridad</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? "Creando…" : "Crear tarea"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TasksMiniList({ tasks, onChanged }: { tasks: TaskRow[]; onChanged: () => void }) {
  const { toast } = useToast();
  const toggle = async (t: TaskRow) => {
    try {
      await api(`/api/tasks/${t.id}`, { method: "PATCH", json: { status: t.status === "DONE" ? "PENDING" : "DONE" } });
      onChanged();
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };
  if (tasks.length === 0) return <p className="py-8 text-center text-sm text-slate-500">Sin tareas para este contacto.</p>;
  return (
    <div className="space-y-2">
      {tasks.map((t) => {
        const overdue = t.dueDate && t.status === "PENDING" && isOverdue(t.dueDate);
        return (
          <div key={t.id} className="flex items-start gap-2.5 rounded-lg border p-2.5">
            <Checkbox className="mt-0.5" checked={t.status === "DONE"} onCheckedChange={() => toggle(t)} />
            <div className="min-w-0">
              <p className={`text-sm ${t.status === "DONE" ? "text-slate-400 line-through" : "text-slate-800"}`}>{t.title}</p>
              <p className="text-[11px] text-slate-500">
                {t.dueDate ? <span className={overdue ? "font-semibold text-rose-600" : ""}>{relativeDays(t.dueDate)} · {fmtDate(t.dueDate)}</span> : "sin fecha"}
                {" · "}{PRIORITY_LABELS[t.priority]} · {t.assignedTo?.name ?? "sin responsable"}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
