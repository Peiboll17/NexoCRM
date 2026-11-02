import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, UNAUTHORIZED, FORBIDDEN, jsonError, readBody } from "@/lib/auth";
import { taskInclude } from "@/lib/includes";

/** Ficha 360º del contacto: datos, negocios, cronología omnicanal y tareas. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();

  const { id } = await params;
  const contact = await db.contact.findUnique({
    where: { id },
    include: {
      company: true,
      owner: { select: { id: true, name: true } },
      deals: {
        include: { stage: true, owner: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      },
      tasks: { include: taskInclude, orderBy: [{ status: "asc" }, { dueDate: "asc" }] },
    },
  });
  if (!contact) return jsonError("Contacto no encontrado", 404);

  // RBAC: solo el propietario o la dirección pueden abrir la ficha
  if (me.role === "SALES_REP" && contact.ownerId !== me.id) return FORBIDDEN();

  // Cronología omnicanal: actividades del contacto Y de sus negocios vinculados.
  // Se consulta aparte porque el include anidado de Prisma añade contactId = id,
  // lo que excluiría actividades registradas solo contra el negocio.
  const activities = await db.activity.findMany({
    where: { OR: [{ contactId: id }, { deal: { contactId: id } }] },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { occurredAt: "desc" },
  });

  return Response.json({ contact: { ...contact, activities } });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();

  const { id } = await params;
  const existing = await db.contact.findUnique({ where: { id } });
  if (!existing) return jsonError("Contacto no encontrado", 404);
  if (me.role === "SALES_REP" && existing.ownerId !== me.id) return FORBIDDEN();

  const body = await readBody<{
    firstName?: string; lastName?: string; email?: string; phone?: string;
    position?: string; linkedin?: string; notes?: string; companyId?: string | null;
  }>(req);

  const data: Record<string, string | null> = {};
  for (const key of ["firstName", "lastName", "email", "phone", "position", "linkedin", "notes"] as const) {
    if (body[key] !== undefined) data[key] = body[key]?.trim() || null;
  }
  if (body.companyId !== undefined) data.companyId = body.companyId || null;
  if (data.firstName === null) return jsonError("El nombre no puede estar vacío", 400);

  const contact = await db.contact.update({
    where: { id },
    data,
    include: { company: { select: { id: true, name: true } }, owner: { select: { id: true, name: true } } },
  });
  return Response.json({ contact });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();

  const { id } = await params;
  const existing = await db.contact.findUnique({ where: { id } });
  if (!existing) return jsonError("Contacto no encontrado", 404);
  if (me.role === "SALES_REP" && existing.ownerId !== me.id) return FORBIDDEN();

  // Cascade: actividades y tareas del contacto; los negocios se desvinculan
  await db.deal.updateMany({ where: { contactId: id }, data: { contactId: null } });
  await db.contact.delete({ where: { id } });
  return Response.json({ ok: true });
}
