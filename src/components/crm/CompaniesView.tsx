"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type SessionUser, type CompanyRow } from "@/lib/client";
import { useToast } from "@/hooks/use-toast";
import { Building2, Search, Plus, Pencil, Trash2, Globe } from "lucide-react";

type CompanyForm = {
  name: string; legalName: string; website: string; sector: string;
  address: string; city: string; country: string; phone: string; notes: string;
};
const emptyCompany: CompanyForm = { name: "", legalName: "", website: "", sector: "", address: "", city: "", country: "", phone: "", notes: "" };

export function CompaniesView({ reloadSignal }: { user: SessionUser; reloadSignal: number }) {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyRow | null>(null);
  const [form, setForm] = useState<CompanyForm>(emptyCompany);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = () => {
    api<{ companies: CompanyRow[] }>("/api/companies")
      .then((d) => setCompanies(d.companies))
      .catch((e) => toast({ title: "Error cargando empresas", description: e instanceof Error ? e.message : "", variant: "destructive" }))
      .finally(() => setLoading(false));
  };
  useEffect(load, [reloadSignal]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return companies;
    return companies.filter((c) => [c.name, c.legalName, c.sector, c.city, c.country].join(" ").toLowerCase().includes(q));
  }, [companies, query]);

  const save = async () => {
    if (!form.name.trim()) { toast({ title: "El nombre es obligatorio", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), legalName: form.legalName.trim() || null,
        website: form.website.trim() || null, sector: form.sector.trim() || null,
        address: form.address.trim() || null, city: form.city.trim() || null,
        country: form.country.trim() || null, phone: form.phone.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        await api(`/api/companies/${editing.id}`, { method: "PATCH", json: payload });
        toast({ title: "Empresa actualizada" });
      } else {
        await api("/api/companies", { method: "POST", json: payload });
        toast({ title: "Empresa creada" });
      }
      setFormOpen(false);
      load();
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const remove = async (c: CompanyRow) => {
    if (!confirm(`¿Eliminar la empresa "${c.name}"?`)) return;
    try {
      await api(`/api/companies/${c.id}`, { method: "DELETE" });
      setCompanies((prev) => prev.filter((x) => x.id !== c.id));
      toast({ title: "Empresa eliminada" });
    } catch (e) {
      toast({ title: "No se puede eliminar", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Building2 className="h-5 w-5 text-emerald-600" /> Empresas</h2>
          <p className="text-sm text-slate-500">{companies.length} cuentas · clientes y prospectos</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input placeholder="Buscar empresa…" className="pl-9 w-56" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <Button className="bg-emerald-600 hover:bg-emerald-700 whitespace-nowrap" onClick={() => { setEditing(null); setForm(emptyCompany); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Nueva empresa
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.length === 0 && <p className="text-sm text-slate-500">Sin resultados.</p>}
          {filtered.map((c) => (
            <div key={c.id} className="group rounded-xl border bg-white p-4 transition hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-800">{c.name}</p>
                  <p className="truncate text-xs text-slate-500">{c.legalName ?? c.sector ?? "—"}</p>
                </div>
                <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button aria-label="Editar" className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    onClick={() => {
                      setEditing(c);
                      setForm({
                        name: c.name, legalName: c.legalName ?? "", website: c.website ?? "", sector: c.sector ?? "",
                        address: c.address ?? "", city: c.city ?? "", country: c.country ?? "", phone: c.phone ?? "", notes: c.notes ?? "",
                      });
                      setFormOpen(true);
                    }}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button aria-label="Eliminar" className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => remove(c)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {c.sector && <Badge variant="secondary">{c.sector}</Badge>}
                {c.city && <Badge variant="outline">{c.city}{c.country ? `, ${c.country}` : ""}</Badge>}
                {c.website && (
                  <a href={c.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline">
                    <Globe className="h-3 w-3" /> web
                  </a>
                )}
              </div>
              {c.phone && <p className="mt-2 text-xs text-slate-500">☎ {c.phone}</p>}
              <div className="mt-3 flex gap-3 border-t border-slate-100 pt-2.5 text-xs text-slate-500">
                <span><strong className="text-slate-700">{c._count?.contacts ?? 0}</strong> contacto(s)</span>
                <span><strong className="text-slate-700">{c._count?.deals ?? 0}</strong> negocio(s)</span>
                <span className="ml-auto">{c.owner?.name ?? "—"}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar empresa" : "Nueva empresa"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nombre comercial *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Razón social</Label>
                <Input value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Web</Label>
                <Input placeholder="https://…" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Sector</Label>
                <Input placeholder="Logística, salud…" value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Dirección</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Ciudad</Label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>País</Label>
                <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Teléfono</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
