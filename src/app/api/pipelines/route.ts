import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, UNAUTHORIZED, FORBIDDEN, jsonError, readBody, isManager } from "@/lib/auth";
import { dealCardInclude } from "@/lib/includes";

/** Embudo completo: etapas ordenadas + negocios abiertos por etapa. */
export async function GET() {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();

  const ownerFilter = me.role === "SALES_REP" ? { ownerId: me.id } : {};

  const stages = await db.stage.findMany({ orderBy: { order: "asc" } });
  const deals = await db.deal.findMany({
    where: ownerFilter,
    include: dealCardInclude,
    orderBy: { createdAt: "desc" },
  });

  return Response.json({ stages, deals });
}

/** Crear etapa (solo dirección) */
export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();
  if (!isManager(me.role)) return FORBIDDEN();

  const { name, probability, color } = await readBody<{
    name?: string; probability?: number; color?: string;
  }>(req);
  if (!name?.trim()) return jsonError("El nombre de la etapa es obligatorio", 400);

  const last = await db.stage.findFirst({ orderBy: { order: "desc" } });
  const stage = await db.stage.create({
    data: {
      name: name.trim(),
      order: (last?.order ?? -1) + 1,
      probability: Math.min(100, Math.max(0, Number(probability) || 0)),
      color: color || "#64748b",
    },
  });
  return Response.json({ stage }, { status: 201 });
}
