import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { db } from "@/lib/db";

// ============================================================
// Autenticación por sesión (cookie httpOnly firmada con HMAC)
// + Control de Acceso RBAC: ADMIN > SALES_DIRECTOR > SALES_REP
// ============================================================

export const SESSION_COOKIE = "crm_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 días

function getSecret(): string {
  return process.env.AUTH_SECRET || "nexocrm-dev-secret-change-in-production";
}

// ---------- Contraseñas (scrypt con salt aleatoria) ----------

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(candidate, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- Tokens de sesión ----------

function sign(payload: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export function createSessionToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, exp: Date.now() + SESSION_TTL_MS })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof data.userId !== "string" || typeof data.exp !== "number") return null;
    if (Date.now() > data.exp) return null;
    return data.userId;
  } catch {
    return null;
  }
}

// ---------- Usuario de sesión actual ----------

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "SALES_DIRECTOR" | "SALES_REP";
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const userId = readSessionToken(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!user) return null;
  return user as SessionUser;
}

// ---------- RBAC ----------

export function isManager(role: string): boolean {
  return role === "ADMIN" || role === "SALES_DIRECTOR";
}

/** Filtro de cartera: un comercial solo ve lo suyo; dirección/admin lo ven todo. */
export function ownershipFilter(user: SessionUser): string | null {
  return isManager(user.role) ? null : user.id;
}

// ---------- Respuestas HTTP de ayuda ----------

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export const UNAUTHORIZED = () => jsonError("No autenticado", 401);
export const FORBIDDEN = () => jsonError("No tienes permisos para esta acción", 403);

/** Valida el cuerpo JSON de una petición. */
export async function readBody<T = Record<string, unknown>>(
  req: NextRequest
): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
