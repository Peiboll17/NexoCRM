import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  getSessionUser,
  UNAUTHORIZED,
  FORBIDDEN,
  jsonError,
  readBody,
  hashPassword,
} from "@/lib/auth";

const ROLES = ["ADMIN", "SALES_DIRECTOR", "SALES_REP"];

export async function GET() {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();
  if (me.role === "SALES_REP") return FORBIDDEN();

  const users = await db.user.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, email: true, role: true, quota: true, createdAt: true,
      _count: { select: { dealsOwned: true, contactsOwned: true, tasksAssigned: true } },
    },
  });
  return Response.json({ users });
}

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return UNAUTHORIZED();
  if (me.role !== "ADMIN") return FORBIDDEN();

  const { name, email, role, password, quota } = await readBody<{
    name?: string; email?: string; role?: string; password?: string; quota?: number | string | null;
  }>(req);

  if (!name?.trim() || !email?.trim() || !password) {
    return jsonError("Nombre, email y contraseña son obligatorios", 400);
  }
  if (password.length < 6) return jsonError("La contraseña debe tener al menos 6 caracteres", 400);
  if (!role || !ROLES.includes(role)) return jsonError("Rol no válido", 400);

  const parsedQuota = parseQuota(quota);
  if (parsedQuota === "invalid") {
    return jsonError("La cuota debe ser un número mayor que 0", 400);
  }

  const exists = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (exists) return jsonError("Ya existe un usuario con ese email", 409);

  const user = await db.user.create({
    data: {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      role,
      passwordHash: hashPassword(password),
      ...(parsedQuota === "unset" ? {} : { quota: parsedQuota }),
    },
    select: { id: true, name: true, email: true, role: true, quota: true },
  });
  return Response.json({ user }, { status: 201 });
}

/** Convierte la cuota recibida: null/""/undefined → unset · número > 0 → valor · otro → invalid */
function parseQuota(value: number | string | null | undefined): number | null | "unset" | "invalid" {
  if (value === undefined || value === null || value === "") return "unset";
  const n = typeof value === "number" ? value : Number(String(value).replace(/[.,\s€]/g, (m) => (m === "," ? "." : "")));
  if (!Number.isFinite(n) || n <= 0) return n === 0 ? null : "invalid";
  return Math.round(n);
}
