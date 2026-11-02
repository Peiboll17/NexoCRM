import { getSessionUser, UNAUTHORIZED } from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return UNAUTHORIZED();
  return Response.json({ user });
}
