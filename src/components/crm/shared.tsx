"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, LifeBuoy, Mail, Phone, Bot, StickyNote } from "lucide-react";
import { initials, ROLE_LABELS, ACTIVITY_LABELS, type Role } from "@/lib/client";

export function RoleBadge({ role }: { role: Role }) {
  const styles: Record<Role, string> = {
    ADMIN: "bg-violet-100 text-violet-700 hover:bg-violet-100",
    SALES_DIRECTOR: "bg-amber-100 text-amber-800 hover:bg-amber-100",
    SALES_REP: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  };
  return <Badge variant="secondary" className={styles[role]}>{ROLE_LABELS[role]}</Badge>;
}

export function UserAvatar({ name, className }: { name?: string | null; className?: string }) {
  return (
    <Avatar className={className ?? "h-8 w-8"}>
      <AvatarFallback className="bg-emerald-100 text-emerald-800 text-xs font-semibold">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

export const activityIconStyle: Record<string, { icon: React.ReactNode; classes: string }> = {
  CALL: { icon: <Phone className="h-3.5 w-3.5" />, classes: "bg-sky-100 text-sky-700" },
  EMAIL: { icon: <Mail className="h-3.5 w-3.5" />, classes: "bg-teal-100 text-teal-700" },
  MEETING: { icon: <CalendarDays className="h-3.5 w-3.5" />, classes: "bg-amber-100 text-amber-700" },
  NOTE: { icon: <StickyNote className="h-3.5 w-3.5" />, classes: "bg-slate-200 text-slate-700" },
  SUPPORT: { icon: <LifeBuoy className="h-3.5 w-3.5" />, classes: "bg-rose-100 text-rose-700" },
  SYSTEM: { icon: <Bot className="h-3.5 w-3.5" />, classes: "bg-violet-100 text-violet-700" },
};

export function ActivityIcon({ type }: { type: string }) {
  const meta = activityIconStyle[type] ?? activityIconStyle.NOTE;
  return (
    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${meta.classes}`}>
      {meta.icon}
    </div>
  );
}

export function ActivityTypeBadge({ type }: { type: string }) {
  return (
    <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-5">
      {ACTIVITY_LABELS[type] ?? type}
    </Badge>
  );
}
