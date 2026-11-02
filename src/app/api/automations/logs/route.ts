import { db } from "@/lib/db";
import { getSessionUser, UNAUTHORIZED, FORBIDDEN, isManager } from "@/lib/auth";

/** Registro de auditoría del motor de automatización. */
export async function GET() {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();
  if (!isManager(me.role)) return FORBIDDEN();

  const logs = await db.automationLog.findMany({
    include: { rule: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return Response.json({ logs });
}
