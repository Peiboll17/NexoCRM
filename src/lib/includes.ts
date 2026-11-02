import { Prisma } from "@prisma/client";

// Fragmentos de inclusión compartidos entre rutas API

export const dealCardInclude = {
  stage: true,
  company: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true, email: true } },
  owner: { select: { id: true, name: true } },
} satisfies Prisma.DealInclude;

export const activityInclude = {
  user: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
  deal: { select: { id: true, title: true } },
} satisfies Prisma.ActivityInclude;

export const taskInclude = {
  assignedTo: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
  deal: { select: { id: true, title: true } },
} satisfies Prisma.TaskInclude;

export function fullName(c?: { firstName: string; lastName: string | null } | null): string {
  return c ? `${c.firstName}${c.lastName ? " " + c.lastName : ""}` : "—";
}

export const ACTIVITY_TYPES = ["CALL", "EMAIL", "MEETING", "NOTE", "SUPPORT", "SYSTEM"];
export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH"];
