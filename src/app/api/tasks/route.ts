import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, UNAUTHORIZED, jsonError, readBody } from "@/lib/auth";
import { taskInclude, TASK_PRIORITIES } from "@/lib/includes";

export async function GET(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();

  // RBAC: un comercial solo ve sus tareas; dirección ve las del equipo
  const ownerFilter = me.role === "SALES_REP" ? { assignedToId: me.id } : {};
  const mineOnly = req.nextUrl.searchParams.get("mine") === "1";

  const tasks = await db.task.findMany({
    where: { ...ownerFilter, ...(mineOnly ? { assignedToId: me.id } : {}) },
    include: taskInclude,
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
  });
  return Response.json({ tasks });
}

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();

  const body = await readBody<{
    title?: string; description?: string; dueDate?: string; priority?: string;
    assignedToId?: string; contactId?: string; dealId?: string;
  }>(req);

  if (!body.title?.trim()) return jsonError("El título de la tarea es obligatorio", 400);
  if (body.priority && !TASK_PRIORITIES.includes(body.priority)) {
    return jsonError("Prioridad no válida", 400);
  }

  // Un comercial solo puede asignarse tareas a sí mismo
  const assignedToId = me.role === "SALES_REP" ? me.id : body.assignedToId || me.id;

  const task = await db.task.create({
    data: {
      title: body.title.trim(),
      description: body.description?.trim() || null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      priority: body.priority || "MEDIUM",
      status: "PENDING",
      assignedToId,
      contactId: body.contactId || null,
      dealId: body.dealId || null,
    },
    include: taskInclude,
  });
  return Response.json({ task }, { status: 201 });
}
