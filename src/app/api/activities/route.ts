import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, UNAUTHORIZED, jsonError, readBody } from "@/lib/auth";
import { activityInclude, ACTIVITY_TYPES } from "@/lib/includes";

/** Feed de actividades (cronología). Filtros: contactId, dealId. */
export async function GET(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();

  const contactId = req.nextUrl.searchParams.get("contactId");
  const dealId = req.nextUrl.searchParams.get("dealId");
  const limit = Number(req.nextUrl.searchParams.get("limit")) || 20;

  const ownerFilter = me.role === "SALES_REP"
    ? { OR: [{ deal: { ownerId: me.id } }, { contact: { ownerId: me.id } }, { userId: me.id }] }
    : {};

  const activities = await db.activity.findMany({
    where: {
      ...ownerFilter,
      ...(contactId ? { contactId } : {}),
      ...(dealId ? { dealId } : {}),
    },
    include: activityInclude,
    orderBy: { occurredAt: "desc" },
    take: limit,
  });
  return Response.json({ activities });
}

/** Registra una interacción (llamada, email, reunión, nota, soporte). */
export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();

  const body = await readBody<{
    type?: string; subject?: string; description?: string;
    contactId?: string; dealId?: string; occurredAt?: string;
  }>(req);

  if (!body.type || !ACTIVITY_TYPES.includes(body.type)) {
    return jsonError("Tipo de actividad no válido", 400);
  }
  if (!body.subject?.trim()) return jsonError("El asunto es obligatorio", 400);
  if (!body.contactId && !body.dealId) {
    return jsonError("La actividad debe estar enlazada a un contacto o a un negocio", 400);
  }

  if (body.contactId && me.role === "SALES_REP") {
    const contact = await db.contact.findUnique({ where: { id: body.contactId } });
    if (contact && contact.ownerId !== me.id) return jsonError("Contacto fuera de tu cartera", 403);
  }
  if (body.dealId && me.role === "SALES_REP") {
    const deal = await db.deal.findUnique({ where: { id: body.dealId } });
    if (deal && deal.ownerId !== me.id) return jsonError("Negocio fuera de tu cartera", 403);
  }

  const activity = await db.activity.create({
    data: {
      type: body.type,
      subject: body.subject.trim(),
      description: body.description?.trim() || null,
      contactId: body.contactId || null,
      dealId: body.dealId || null,
      userId: me.id,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
    },
    include: activityInclude,
  });
  return Response.json({ activity }, { status: 201 });
}
