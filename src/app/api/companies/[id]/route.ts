import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, UNAUTHORIZED, jsonError, readBody } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();

  const { id } = await params;
  const body = await readBody<{
    name?: string; legalName?: string; website?: string; sector?: string;
    address?: string; city?: string; country?: string; phone?: string; notes?: string;
  }>(req);

  const data: Record<string, string | null> = {};
  for (const key of ["name", "legalName", "website", "sector", "address", "city", "country", "phone", "notes"] as const) {
    if (body[key] !== undefined) data[key] = body[key]?.trim() || null;
  }
  if (data.name === null) return jsonError("El nombre no puede estar vacío", 400);

  const company = await db.company.update({
    where: { id },
    data,
    include: { owner: { select: { id: true, name: true } }, _count: { select: { contacts: true, deals: true } } },
  });
  return Response.json({ company });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();

  const { id } = await params;
  const company = await db.company.findUnique({
    where: { id },
    include: { _count: { select: { contacts: true, deals: true } } },
  });
  if (!company) return jsonError("Empresa no encontrada", 404);
  if (company._count.contacts > 0 || company._count.deals > 0) {
    return jsonError(
      `No se puede eliminar: tiene ${company._count.contacts} contacto(s) y ${company._count.deals} negocio(s) vinculados. Reasígnalos primero.`,
      409
    );
  }
  await db.company.delete({ where: { id } });
  return Response.json({ ok: true });
}
