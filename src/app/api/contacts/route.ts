import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, UNAUTHORIZED, jsonError, readBody } from "@/lib/auth";
import { fullName } from "@/lib/includes";

export async function GET(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();

  // RBAC: un comercial solo ve su cartera; dirección lo ve todo
  const ownerFilter = me.role === "SALES_REP" ? { ownerId: me.id } : {};

  const contacts = await db.contact.findMany({
    where: ownerFilter,
    include: {
      company: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      _count: { select: { deals: true, activities: true, tasks: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Búsqueda en memoria ( SQLite no soporta mode:"insensitive" )
  const q = req.nextUrl.searchParams.get("q")?.toLowerCase().trim();
  const companyId = req.nextUrl.searchParams.get("companyId");
  let result = contacts;
  if (q) {
    result = contacts.filter((c) => {
      const hay = [
        c.firstName, c.lastName, c.email, c.phone, c.position,
        c.company?.name, fullName(c),
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }
  if (companyId) result = result.filter((c) => c.companyId === companyId);

  return Response.json({ contacts: result });
}

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();

  const body = await readBody<{
    firstName?: string; lastName?: string; email?: string; phone?: string;
    position?: string; linkedin?: string; notes?: string; companyId?: string;
  }>(req);

  if (!body.firstName?.trim()) return jsonError("El nombre es obligatorio", 400);
  if (body.email?.trim()) {
    const dup = await db.contact.findFirst({ where: { email: body.email.trim() } });
    if (dup) return jsonError(`Ya existe un contacto con ese email (${fullName(dup)})`, 409);
  }

  const contact = await db.contact.create({
    data: {
      firstName: body.firstName.trim(),
      lastName: body.lastName?.trim() || null,
      email: body.email?.trim() || null,
      phone: body.phone?.trim() || null,
      position: body.position?.trim() || null,
      linkedin: body.linkedin?.trim() || null,
      notes: body.notes?.trim() || null,
      companyId: body.companyId || null,
      ownerId: me.id,
    },
    include: {
      company: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      _count: { select: { deals: true, activities: true, tasks: true } },
    },
  });

  // Registra automáticamente la interacción de creación en la cronología
  await db.activity.create({
    data: {
      type: "SYSTEM",
      subject: "Contacto creado",
      description: `${fullName(contact)} se incorporó al CRM`,
      contactId: contact.id,
      userId: me.id,
    },
  });

  return Response.json({ contact }, { status: 201 });
}
