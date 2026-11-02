import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, UNAUTHORIZED, jsonError, readBody } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();

  const companies = await db.company.findMany({
    include: {
      owner: { select: { id: true, name: true } },
      _count: { select: { contacts: true, deals: true } },
    },
    orderBy: { name: "asc" },
  });
  return Response.json({ companies });
}

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();

  const body = await readBody<{
    name?: string; legalName?: string; website?: string; sector?: string;
    address?: string; city?: string; country?: string; phone?: string; notes?: string;
  }>(req);

  if (!body.name?.trim()) return jsonError("El nombre de la empresa es obligatorio", 400);

  const company = await db.company.create({
    data: {
      name: body.name.trim(),
      legalName: body.legalName?.trim() || null,
      website: body.website?.trim() || null,
      sector: body.sector?.trim() || null,
      address: body.address?.trim() || null,
      city: body.city?.trim() || null,
      country: body.country?.trim() || null,
      phone: body.phone?.trim() || null,
      notes: body.notes?.trim() || null,
      ownerId: me.id,
    },
    include: { owner: { select: { id: true, name: true } } },
  });
  return Response.json({ company }, { status: 201 });
}
