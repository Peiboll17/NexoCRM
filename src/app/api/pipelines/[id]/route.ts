import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, UNAUTHORIZED, FORBIDDEN, jsonError, readBody } from "@/lib/auth";

/** Actualiza una etapa del embudo (nombre, probabilidad, color, orden). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();
  if (me.role === "SALES_REP") return FORBIDDEN();

  const { id } = await params;
  const { name, probability, color, order } = await readBody<{
    name?: string; probability?: number; color?: string; order?: number;
  }>(req);

  const data: Record<string, string | number> = {};
  if (name?.trim()) data.name = name.trim();
  if (probability !== undefined) data.probability = Math.min(100, Math.max(0, Number(probability) || 0));
  if (color) data.color = color;
  if (order !== undefined) data.order = Number(order);

  const stage = await db.stage.update({ where: { id }, data });
  return Response.json({ stage });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();
  if (me.role === "SALES_REP") return FORBIDDEN();

  const { id } = await params;
  const stage = await db.stage.findUnique({
    where: { id },
    include: { _count: { select: { deals: true } } },
  });
  if (!stage) return jsonError("Etapa no encontrada", 404);
  if (stage._count.deals > 0) {
    return jsonError(`La etapa tiene ${stage._count.deals} negocio(s). Muévelos antes de eliminarla.`, 409);
  }
  await db.stage.delete({ where: { id } });
  return Response.json({ ok: true });
}
