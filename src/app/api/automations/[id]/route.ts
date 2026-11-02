import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, UNAUTHORIZED, FORBIDDEN, readBody, isManager } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();
  if (!isManager(me.role)) return FORBIDDEN();

  const { id } = await params;
  const { active, name } = await readBody<{ active?: boolean; name?: string }>(req);

  const data: Record<string, string | boolean> = {};
  if (typeof active === "boolean") data.active = active;
  if (name?.trim()) data.name = name.trim();

  const rule = await db.automationRule.update({
    where: { id },
    data,
    include: { _count: { select: { logs: true } } },
  });
  return Response.json({ rule });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();
  if (!isManager(me.role)) return FORBIDDEN();

  const { id } = await params;
  await db.automationLog.deleteMany({ where: { ruleId: id } });
  await db.automationRule.delete({ where: { id } });
  return Response.json({ ok: true });
}
