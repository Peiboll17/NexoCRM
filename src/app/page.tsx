"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api, type SessionUser } from "@/lib/client";
import { RoleBadge, UserAvatar } from "@/components/crm/shared";
import { LoginView } from "@/components/crm/LoginView";
import { DashboardView } from "@/components/crm/DashboardView";
import { ReportsView } from "@/components/crm/ReportsView";
import { PipelineView } from "@/components/crm/PipelineView";
import { ContactsView } from "@/components/crm/ContactsView";
import { CompaniesView } from "@/components/crm/CompaniesView";
import { TasksView } from "@/components/crm/TasksView";
import { AutomationsView } from "@/components/crm/AutomationsView";
import { UsersView } from "@/components/crm/UsersView";
import { NotificationsBell } from "@/components/crm/NotificationsBell";
import { useToast } from "@/hooks/use-toast";
import {
  KanbanSquare, LayoutDashboard, BarChart3, Users2, Building2, ListChecks,
  Workflow, ShieldCheck, LogOut, Menu, RefreshCw,
} from "lucide-react";

type ViewKey = "dashboard" | "reports" | "pipeline" | "contacts" | "companies" | "tasks" | "automations" | "users";

export default function Home() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [view, setView] = useState<ViewKey>("dashboard");
  const [reloadSignal, setReloadSignal] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    api<{ user: SessionUser }>("/api/auth/me")
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setBooting(false));
  }, []);

  const isManager = user && (user.role === "ADMIN" || user.role === "SALES_DIRECTOR");
  const isAdmin = user?.role === "ADMIN";

  const NAV: { key: ViewKey; label: string; icon: React.ReactNode; show: boolean }[] = [
    { key: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4.5 w-4.5" />, show: true },
    { key: "reports", label: "Reportes", icon: <BarChart3 className="h-4.5 w-4.5" />, show: true },
    { key: "pipeline", label: "Pipeline", icon: <KanbanSquare className="h-4.5 w-4.5" />, show: true },
    { key: "contacts", label: "Contactos", icon: <Users2 className="h-4.5 w-4.5" />, show: true },
    { key: "companies", label: "Empresas", icon: <Building2 className="h-4.5 w-4.5" />, show: true },
    { key: "tasks", label: "Tareas", icon: <ListChecks className="h-4.5 w-4.5" />, show: true },
    { key: "automations", label: "Automatizaciones", icon: <Workflow className="h-4.5 w-4.5" />, show: !!isManager },
    { key: "users", label: "Usuarios", icon: <ShieldCheck className="h-4.5 w-4.5" />, show: !!isAdmin },
  ];

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    setView("dashboard");
    toast({ title: "Sesión cerrada" });
  }, [toast]);

  const refresh = useCallback(() => setReloadSignal((s) => s + 1), []);

  const go = (key: ViewKey) => {
    setView(key);
    setNavOpen(false);
    window.scrollTo({ top: 0 }); // cada vista empieza arriba
    refresh(); // cada vista recarga al entrar → datos siempre frescos
  };

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-2 text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin" /> Cargando NexoCRM…
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginView onLoggedIn={(u) => { setUser(u); setView("dashboard"); }} />;
  }

  const current = NAV.find((n) => n.key === view);

  const navList = (
    <nav className="flex flex-col gap-1" aria-label="Navegación principal">
      {NAV.filter((n) => n.show).map((n) => (
        <button
          key={n.key}
          onClick={() => go(n.key)}
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
            view === n.key
              ? "bg-emerald-600/15 text-emerald-400"
              : "text-slate-300 hover:bg-white/5 hover:text-white"
          }`}
        >
          {n.icon} {n.label}
        </button>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Sidebar escritorio */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-slate-900 p-4 md:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500">
            <KanbanSquare className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-base font-bold text-white leading-tight">NexoCRM</p>
            <p className="text-[10px] text-emerald-400/90">Pipeline · Timeline · Automation</p>
          </div>
        </div>
        {navList}
        <div className="mt-auto rounded-xl bg-white/5 p-3">
          <div className="flex items-center gap-2.5">
            <UserAvatar name={user.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{user.name}</p>
              <p className="truncate text-[11px] text-slate-400">{user.email}</p>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <RoleBadge role={user.role} />
            <Button variant="ghost" size="sm" className="h-8 px-2 text-slate-300 hover:bg-white/10 hover:text-white" onClick={logout}>
              <LogOut className="h-4 w-4 mr-1" /> Salir
            </Button>
          </div>
        </div>
      </aside>

      {/* Cabecera móvil */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-slate-900 px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500">
            <KanbanSquare className="h-4.5 w-4.5 text-white" />
          </div>
          <span className="font-bold text-white">NexoCRM</span>
        </div>
        <div className="flex items-center gap-2">
          <NotificationsBell user={user} reloadSignal={reloadSignal} />
          <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-slate-300" aria-label="Abrir menú" onClick={() => setNavOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Navegación móvil (sheet) */}
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="w-64 bg-slate-900 border-slate-800 p-4">
          <SheetHeader className="p-0 pb-4">
            <SheetTitle className="flex items-center gap-2 text-white">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500">
                <KanbanSquare className="h-4 w-4 text-white" />
              </div>
              NexoCRM
            </SheetTitle>
          </SheetHeader>
          {navList}
          <div className="mt-6 rounded-xl bg-white/5 p-3">
            <p className="text-sm font-medium text-white">{user.name}</p>
            <RoleBadge role={user.role} />
            <Button variant="ghost" size="sm" className="mt-2 w-full text-slate-300 hover:bg-white/10 hover:text-white" onClick={logout}>
              <LogOut className="h-4 w-4 mr-1" /> Cerrar sesión
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Contenido */}
      <main className="md:pl-60 min-h-screen flex flex-col">
        <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="hidden md:block">
              <p className="text-xs uppercase tracking-widest text-slate-400">NexoCRM</p>
              <h1 className="text-xl font-bold text-slate-900">{current?.label}</h1>
            </div>
            <div className="md:hidden"><h1 className="text-lg font-bold text-slate-900">{current?.label}</h1></div>
            <div className="hidden md:block">
              <NotificationsBell user={user} reloadSignal={reloadSignal} />
            </div>
          </div>
          {view === "dashboard" && <DashboardView user={user} reloadSignal={reloadSignal} />}
          {view === "reports" && <ReportsView user={user} reloadSignal={reloadSignal} />}
          {view === "pipeline" && <PipelineView user={user} reloadSignal={reloadSignal} />}
          {view === "contacts" && <ContactsView user={user} reloadSignal={reloadSignal} />}
          {view === "companies" && <CompaniesView user={user} reloadSignal={reloadSignal} />}
          {view === "tasks" && <TasksView user={user} reloadSignal={reloadSignal} />}
          {view === "automations" && isManager && <AutomationsView user={user} reloadSignal={reloadSignal} />}
          {view === "users" && isAdmin && <UsersView currentUser={user} reloadSignal={reloadSignal} />}
        </div>
        <footer className="mt-auto border-t bg-white">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 text-xs text-slate-400 sm:px-6 lg:px-8">
            <span>NexoCRM — MVP construido con Next.js · Prisma · shadcn/ui</span>
            <span>Demo: PostgreSQL-ready (SQLite en sandbox)</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
