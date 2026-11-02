import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, UNAUTHORIZED, FORBIDDEN, jsonError, readBody, isManager } from "@/lib/auth";

const TRIGGERS = ["DEAL_CREATED", "DEAL_STAGE_CHANGED", "DEAL_WON", "DEAL_LOST"];
const ACTIONS = ["CREATE_TASK", "LOG_ACTIVITY", "SEND_EMAIL"];

export async function GET() {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();
  if (!isManager(me.role)) return FORBIDDEN();

  const rules = await db.automationRule.findMany({
    include: { _count: { select: { logs: true } } },
    orderBy: { createdAt: "desc" },
  });
  return Response.json({ rules });
}

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();
  if (!isManager(me.role)) return FORBIDDEN();

  const body = await readBody<{
    name?: string; trigger?: string; triggerStage?: string;
    actionType?: string; actionConfig?: Record<string, unknown>;
  }>(req);

  if (!body.name?.trim()) return jsonError("El nombre de la regla es obligatorio", 400);
  if (!body.trigger || !TRIGGERS.includes(body.trigger)) return jsonError("Gatillo no válido", 400);
  if (!body.actionType || !ACTIONS.includes(body.actionType)) return jsonError("Acción no válida", 400);

  const rule = await db.automationRule.create({
    data: {
      name: body.name.trim(),
      trigger: body.trigger,
      triggerStage: body.trigger === "DEAL_STAGE_CHANGED" ? body.triggerStage || null : null,
      actionType: body.actionType,
      actionConfig: JSON.stringify(body.actionConfig || {}),
      active: true,
    },
    include: { _count: { select: { logs: true } } },
  });
  return Response.json({ rule }, { status: 201 });
}
