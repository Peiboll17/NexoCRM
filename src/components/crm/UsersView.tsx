"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, fmtDate, fmtMoney, type UserRow, type Role } from "@/lib/client";
import { RoleBadge, UserAvatar } from "@/components/crm/shared";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Pencil, ShieldCheck } from "lucide-react";

const ROLE_OPTIONS: { value: Role; label: string; desc: string }[] = [
  { value: "ADMIN", label: "Administrador", desc: "Todo: usuarios, automatizaciones, embudo y datos" },
  { value: "SALES_DIRECTOR", label: "Director comercial", desc: "Ve todo el equipo; gestiona embudo y automatizaciones" },
  { value: "SALES_REP", label: "Comercial", desc: "Solo ve su cartera de contactos, negocios y tareas" },
];

export function UsersView({ currentUser, reloadSignal }: { currentUser: import("@/lib/client").SessionUser; reloadSignal: number }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "SALES_REP" as Role, password: "", quota: "" });
  const { toast } = useToast();

  const load = () => {
    api<{ users: UserRow[] }>("/api/users")
      .then((d) => setUsers(d.users))
      .catch((e) => toast({ title: "Error", description: e instanceof Error ? e.message : "", variant: "destructive" }))
      .finally(() => setLoading(false));
  };
  useEffect(load, [reloadSignal]);

  const save = async () => {
    setSaving(true);
    try {
      if (editing) {
        await api(`/api/users/${editing.id}`, {
          method: "PATCH",
          json: { name: form.name, role: form.role, password: form.password || undefined, quota: form.quota === "" ? null : form.quota },
        });
        toast({ title: "Usuario actualizado" });
      } else {
        await api("/api/users", { method: "POST", json: { ...form, password: form.password } });
        toast({ title: "Usuario creado", description: `${form.email} ya puede iniciar sesión.` });
      }
      setOpen(false);
      load();
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const remove = async (u: UserRow) => {
    if (!confirm(`¿Eliminar al usuario ${u.name}?`)) return;
    try {
      await api(`/api/users/${u.id}`, { method: "DELETE" });
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      toast({ title: "Usuario eliminado" });
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-600" /> Usuarios y permisos</h2>
          <p className="text-sm text-slate-500">Control de acceso RBAC: cada rol ve únicamente lo que le corresponde.</p>
        </div>
        <Button onClick={() => { setEditing(null); setForm({ name: "", email: "", role: "SALES_REP", password: "", quota: "" }); setOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4 mr-1" /> Nuevo usuario
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {ROLE_OPTIONS.map((r) => (
          <div key={r.value} className="rounded-xl border bg-white p-3.5">
            <RoleBadge role={r.value} />
            <p className="mt-2 text-xs leading-relaxed text-slate-500">{r.desc}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-white">
        {loading ? (
          <div className="space-y-2 p-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Usuario</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead className="hidden sm:table-cell">Cuota mensual</TableHead>
                  <TableHead className="hidden md:table-cell">Cartera</TableHead>
                  <TableHead className="hidden lg:table-cell">Alta</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <UserAvatar name={u.name} />
                        <div>
                          <p className="text-sm font-medium text-slate-800">{u.name}{u.id === currentUser.id && <span className="ml-1.5 text-[10px] text-emerald-600">(tú)</span>}</p>
                          <p className="text-xs text-slate-500">{u.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><RoleBadge role={u.role} /></TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-slate-600">
                      {u.quota ? (
                        <span className="font-medium">{fmtMoney(u.quota)}<span className="text-xs text-slate-400"> /mes</span></span>
                      ) : (
                        <span className="text-xs text-slate-400">Sin objetivo</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-slate-500">
                      {u._count.dealsOwned} negocios · {u._count.contactsOwned} contactos · {u._count.tasksAssigned} tareas
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-slate-500">{fmtDate(u.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <button aria-label="Editar" className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                          onClick={() => {
                            setEditing(u);
                            setForm({ name: u.name, email: u.email, role: u.role, password: "", quota: u.quota ? String(u.quota) : "" });
                            setOpen(true);
                          }}>
                          <Pencil className="h-4 w-4" />
                        </button>
                        {u.id !== currentUser.id && (
                          <button aria-label="Eliminar" className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => remove(u)}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Editar usuario" : "Nuevo usuario"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Nombre *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            {!editing && (
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="nombre@empresa.com" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROLE_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quota">Cuota mensual (€)</Label>
              <Input
                id="quota"
                inputMode="decimal"
                value={form.quota}
                onChange={(e) => setForm({ ...form, quota: e.target.value })}
                placeholder="Ej. 15000 — vacío = sin objetivo"
              />
              <p className="text-[11px] text-slate-400">
                Objetivo de facturación al mes. Se usa para calcular el % de cumplimiento en Reportes y la alerta semanal.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{editing ? "Nueva contraseña (opcional)" : "Contraseña *"}</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Mínimo 6 caracteres" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
