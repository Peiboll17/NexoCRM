import { db } from "@/lib/db";
import { getSessionUser, UNAUTHORIZED } from "@/lib/auth";

/** POST /api/alerts/read — marca todas las notificaciones del usuario como leídas. */
export async function POST() {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();

  await db.notification.updateMany({
    where: { userId: me.id, readAt: null },
    data: { readAt: new Date() },
  });
  return Response.json({ ok: true });
}
