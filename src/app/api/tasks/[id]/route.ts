import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, UNAUTHORIZED, FORBIDDEN, jsonError, readBody } from "@/lib/auth";
import { taskInclude } from "@/lib/includes";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();

  const { id } = await params;
  const existing = await db.task.findUnique({ where: { id } });
  if (!existing) return jsonError("Tarea no encontrada", 404);
  if (me.role === "SALES_REP" && existing.assignedToId !== me.id) return FORBIDDEN();

  const body = await readBody<{
    title?: string; description?: string; dueDate?: string | null;
    priority?: string; status?: string; assignedToId?: string;
  }>(req);

  const data: Record<string, string | Date | null> = {};
  if (body.title?.trim()) data.title = body.title.trim();
  if (body.description !== undefined) data.description = body.description?.trim() || null;
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (body.priority) data.priority = body.priority;
  if (body.status && ["PENDING", "DONE"].includes(body.status)) data.status = body.status;
  if (body.assignedToId && me.role !== "SALES_REP") data.assignedToId = body.assignedToId;

  const task = await db.task.update({ where: { id }, data, include: taskInclude });
  return Response.json({ task });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();

  const { id } = await params;
  const existing = await db.task.findUnique({ where: { id } });
  if (!existing) return jsonError("Tarea no encontrada", 404);
  if (me.role === "SALES_REP" && existing.assignedToId !== me.id) return FORBIDDEN();

  await db.task.delete({ where: { id } });
  return Response.json({ ok: true });
}
