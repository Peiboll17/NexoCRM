import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  SESSION_COOKIE,
  createSessionToken,
  verifyPassword,
  jsonError,
  readBody,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { email, password } = await readBody<{ email?: string; password?: string }>(req);
  if (!email || !password) return jsonError("Introduce email y contraseña", 400);

  const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return jsonError("Credenciales incorrectas", 401);
  }

  const res = Response.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
  res.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${createSessionToken(user.id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`
  );
  return res;
}
