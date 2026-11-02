"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type SessionUser, type Role } from "@/lib/client";
import { Building2, Gauge, Workflow, ShieldCheck, Loader2, KanbanSquare } from "lucide-react";

const DEMO_USERS: { email: string; name: string; role: string; roleKey: Role }[] = [
  { email: "admin@nexocrm.com", name: "Laura Giménez", role: "Administrador — acceso total", roleKey: "ADMIN" },
  { email: "director@nexocrm.com", name: "Carlos Ruiz", role: "Director comercial — equipo completo", roleKey: "SALES_DIRECTOR" },
  { email: "comercial@nexocrm.com", name: "Carmen Soto", role: "Comercial — solo su cartera", roleKey: "SALES_REP" },
];

export function LoginView({ onLoggedIn }: { onLoggedIn: (user: SessionUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const login = async (mail: string, pass: string) => {
    setLoading(true);
    setError(null);
    try {
      const { user } = await api<{ user: SessionUser }>("/api/auth/login", {
        method: "POST",
        json: { email: mail, password: pass },
      });
      onLoggedIn(user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-900 flex flex-col lg:flex-row">
      {/* Panel de marca */}
      <div className="flex flex-1 flex-col justify-center px-8 py-12 lg:px-16 text-white">
        <div className="flex items-center gap-3 mb-8">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500 shadow-lg shadow-emerald-500/30">
            <KanbanSquare className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">NexoCRM</h1>
            <p className="text-sm text-emerald-300/80">Pipeline · Cronología · Automatización</p>
          </div>
        </div>
        <p className="max-w-lg text-lg text-slate-300 leading-relaxed">
          El CRM que tu equipo comercial quiere usar: registra una llamada en{" "}
          <span className="text-emerald-400 font-semibold">2 clics</span>, mueve un trato en el
          embudo con <span className="text-emerald-400 font-semibold">arrastrar y soltar</span> y
          deja que las automatizaciones trabajen solas.
        </p>
        <div className="mt-10 grid max-w-lg gap-4 sm:grid-cols-2">
          {[
            { icon: <KanbanSquare className="h-5 w-5" />, title: "Motor de pipelines", desc: "Kanban con previsión ponderada en tiempo real" },
            { icon: <Gauge className="h-5 w-5" />, title: "Cronología omnicanal", desc: "Llamadas, emails, reuniones y soporte en una línea" },
            { icon: <Workflow className="h-5 w-5" />, title: "Automatización de eventos", desc: "Gatillos y acciones: ganado → onboarding + email" },
            { icon: <ShieldCheck className="h-5 w-5" />, title: "Permisos RBAC", desc: "Admin, director comercial y comercial con carteras" },
          ].map((f) => (
            <div key={f.title} className="rounded-xl bg-white/5 border border-white/10 p-4 backdrop-blur">
              <div className="flex items-center gap-2 text-emerald-400 mb-1.5">{f.icon}
                <span className="text-sm font-semibold text-white">{f.title}</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Panel de acceso */}
      <div className="flex w-full lg:w-[480px] items-center justify-center p-6 lg:p-10 bg-white">
        <div className="w-full max-w-sm space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Accede a tu CRM</h2>
            <p className="text-sm text-slate-500 mt-1">
              Elige un usuario demo o escribe tus credenciales.
            </p>
          </div>

          <div className="space-y-2">
            {DEMO_USERS.map((u) => (
              <button
                key={u.email}
                onClick={() => login(u.email, "demo1234")}
                disabled={loading}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-emerald-400 hover:bg-emerald-50 disabled:opacity-50"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-800">{u.name}</span>
                  <span className="text-xs text-slate-400">{u.roleKey === "ADMIN" ? "👑 Admin" : u.roleKey === "SALES_DIRECTOR" ? "📈 Dirección" : "🤝 Comercial"}</span>
                </div>
                <span className="text-xs text-slate-500">{u.role}</span>
              </button>
            ))}
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-200" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-slate-400">o con credenciales</span>
            </div>
          </div>

          <form
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); login(email, password); }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="tu@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <p className="text-sm text-rose-600 bg-rose-50 rounded-md px-3 py-2">{error}</p>}
            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4 mr-1" />}
              Iniciar sesión
            </Button>
          </form>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Usuarios demo</CardTitle></CardHeader>
            <CardContent className="text-xs text-slate-500 leading-relaxed">
              Contraseña única para la demo: <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">demo1234</code>.
              Entra como <strong>Comercial</strong> para comprobar que solo ves tu cartera, y como
              <strong> Administrador</strong> para gestionar usuarios y automatizaciones.
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
