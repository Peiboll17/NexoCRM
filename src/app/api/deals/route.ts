import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, UNAUTHORIZED, jsonError, readBody } from "@/lib/auth";
import { dealCardInclude } from "@/lib/includes";
import { runAutomations } from "@/lib/automations";

export async function GET(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();

  const ownerFilter = me.role === "SALES_REP" ? { ownerId: me.id } : {};
  const status = req.nextUrl.searchParams.get("status"); // OPEN | WON | LOST

  const deals = await db.deal.findMany({
    where: { ...ownerFilter, ...(status ? { status } : {}) },
    include: dealCardInclude,
    orderBy: { createdAt: "desc" },
  });
  return Response.json({ deals });
}

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();

  const body = await readBody<{
    title?: string; amount?: number; stageId?: string; companyId?: string;
    contactId?: string; expectedCloseDate?: string; source?: string; ownerId?: string;
  }>(req);

  if (!body.title?.trim()) return jsonError("El título del negocio es obligatorio", 400);

  const stage = body.stageId
    ? await db.stage.findUnique({ where: { id: body.stageId } })
    : await db.stage.findFirst({ where: { isWon: false, isLost: false }, orderBy: { order: "asc" } });
  if (!stage) return jsonError("No hay etapas de embudo configuradas", 400);
  if (stage.isWon || stage.isLost) return jsonError("Un negocio nuevo no puede empezar en Ganado/Perdido", 400);

  if (body.contactId) {
    const contact = await db.contact.findUnique({ where: { id: body.contactId } });
    if (!contact) return jsonError("Contacto no encontrado", 404);
    if (me.role === "SALES_REP" && contact.ownerId !== me.id) {
      return jsonError("Solo puedes crear negocios sobre contactos de tu cartera", 403);
    }
  }

  // Un comercial solo puede asignarse negocios a sí mismo
  const ownerId = me.role === "SALES_REP" ? me.id : body.ownerId || me.id;

  const deal = await db.deal.create({
    data: {
      title: body.title.trim(),
      amount: Number(body.amount) || 0,
      status: "OPEN",
      stageId: stage.id,
      companyId: body.companyId || null,
      contactId: body.contactId || null,
      ownerId,
      expectedCloseDate: body.expectedCloseDate ? new Date(body.expectedCloseDate) : null,
      source: body.source?.trim() || null,
    },
    include: dealCardInclude,
  });

  await db.activity.create({
    data: {
      type: "SYSTEM",
      subject: "Negocio creado",
      description: `"${deal.title}" inició el embudo en la etapa "${stage.name}"`,
      dealId: deal.id,
      contactId: deal.contactId,
      userId: me.id,
    },
  });

  // Gatillo: DEAL_CREATED
  const contact = deal.contactId ? await db.contact.findUnique({ where: { id: deal.contactId } }) : null;
  const company = deal.companyId ? await db.company.findUnique({ where: { id: deal.companyId } }) : null;
  const automationMessages = await runAutomations({
    trigger: "DEAL_CREATED",
    deal: {
      id: deal.id, title: deal.title, amount: deal.amount, currency: deal.currency,
      stageName: stage.name,
      contactName: contact ? `${contact.firstName}${contact.lastName ? " " + contact.lastName : ""}` : null,
      contactEmail: contact?.email ?? null,
      companyName: company?.name ?? null,
      ownerId: deal.ownerId,
    },
  });

  return Response.json({ deal, automationMessages }, { status: 201 });
}
