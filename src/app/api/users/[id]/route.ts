import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, UNAUTHORIZED, FORBIDDEN, jsonError, readBody, hashPassword } from "@/lib/auth";

const ROLES = ["ADMIN", "SALES_DIRECTOR", "SALES_REP"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();
  if (me.role !== "ADMIN") return FORBIDDEN();

  const { id } = await params;
  const { name, role, password, quota } = await readBody<{
    name?: string; role?: string; password?: string; quota?: number | string | null;
  }>(req);

  const data: Record<string, string | number | null> = {};
  if (name?.trim()) data.name = name.trim();
  if (role && ROLES.includes(role)) data.role = role;
  if (password) {
    if (password.length < 6) return jsonError("La contraseña debe tener al menos 6 caracteres", 400);
    data.passwordHash = hashPassword(password);
  }
  if (quota !== undefined) {
    if (quota === null || quota === "") {
      data.quota = null; // sin objetivo
    } else {
      const n = Number(String(quota).replace(/[.,\s€]/g, (m) => (m === "," ? "." : "")));
      if (!Number.isFinite(n) || n < 0) return jsonError("La cuota debe ser un número válido", 400);
      data.quota = Math.round(n) || null;
    }
  }
  if (Object.keys(data).length === 0) return jsonError("Nada que actualizar", 400);

  const user = await db.user.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, role: true, quota: true },
  });
  return Response.json({ user });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();
  if (me.role !== "ADMIN") return FORBIDDEN();

  const { id } = await params;
  if (id === me.id) return jsonError("No puedes eliminar tu propio usuario", 400);

  await db.user.delete({ where: { id } });
  return Response.json({ ok: true });
}
