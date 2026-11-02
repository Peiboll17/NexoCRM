import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, UNAUTHORIZED, FORBIDDEN, jsonError, readBody } from "@/lib/auth";
import { dealCardInclude } from "@/lib/includes";
import { runAutomations, DealContext } from "@/lib/automations";

/** Actualiza un negocio. Si cambia de etapa, dispara el motor de automatización. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();

  const { id } = await params;
  const existing = await db.deal.findUnique({
    where: { id },
    include: { stage: true, contact: true, company: true },
  });
  if (!existing) return jsonError("Negocio no encontrado", 404);
  if (me.role === "SALES_REP" && existing.ownerId !== me.id) return FORBIDDEN();

  const body = await readBody<{
    title?: string; amount?: number; stageId?: string; companyId?: string | null;
    contactId?: string | null; expectedCloseDate?: string | null; source?: string; ownerId?: string;
  }>(req);

  const data: Record<string, string | number | Date | null> = {};
  if (body.title?.trim()) data.title = body.title.trim();
  if (body.amount !== undefined) data.amount = Number(body.amount) || 0;
  if (body.companyId !== undefined) data.companyId = body.companyId || null;
  if (body.contactId !== undefined) data.contactId = body.contactId || null;
  if (body.source !== undefined) data.source = body.source?.trim() || null;
  if (body.expectedCloseDate !== undefined) {
    data.expectedCloseDate = body.expectedCloseDate ? new Date(body.expectedCloseDate) : null;
  }
  if (body.ownerId && me.role !== "SALES_REP") data.ownerId = body.ownerId;

  // ---- Movimiento de etapa (Kanban) ----
  let trigger: "DEAL_STAGE_CHANGED" | "DEAL_WON" | "DEAL_LOST" | null = null;
  let previousStageName: string | null = existing.stage?.name ?? null;

  if (body.stageId && body.stageId !== existing.stageId) {
    const target = await db.stage.findUnique({ where: { id: body.stageId } });
    if (!target) return jsonError("Etapa no encontrada", 404);

    data.stageId = target.id;
    if (target.isWon) {
      data.status = "WON";
      data.closedAt = new Date();
      trigger = "DEAL_WON";
    } else if (target.isLost) {
      data.status = "LOST";
      data.closedAt = new Date();
      trigger = "DEAL_LOST";
    } else {
      data.status = "OPEN";
      data.closedAt = null;
      trigger = "DEAL_STAGE_CHANGED";
    }
  }

  const deal = await db.deal.update({
    where: { id },
    data,
    include: dealCardInclude,
  });

  // ---- Motor de automatización event-driven ----
  let automationMessages: string[] = [];
  if (trigger) {
    const ctx: DealContext = {
      id: deal.id,
      title: deal.title,
      amount: deal.amount,
      currency: deal.currency,
      stageName: deal.stage?.name ?? null,
      contactName: deal.contact ? `${deal.contact.firstName}${deal.contact.lastName ? " " + deal.contact.lastName : ""}` : null,
      contactEmail: deal.contact?.email ?? null,
      companyName: deal.company?.name ?? null,
      ownerId: deal.ownerId,
    };
    automationMessages = await runAutomations({
      trigger,
      deal: ctx,
      previousStageName,
    });
  }

  return Response.json({ deal, automationMessages });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();

  const { id } = await params;
  const existing = await db.deal.findUnique({ where: { id } });
  if (!existing) return jsonError("Negocio no encontrado", 404);
  if (me.role === "SALES_REP" && existing.ownerId !== me.id) return FORBIDDEN();

  // Las actividades y tareas del negocio se eliminan en cascada
  await db.deal.delete({ where: { id } });
  return Response.json({ ok: true });
}
