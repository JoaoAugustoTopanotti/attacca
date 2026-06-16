import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, makeCookieValue, IDENTITY_COOKIE } from "@/lib/identity";

// GET /api/me — the current identity (or null).
export async function GET() {
  return NextResponse.json(await getCurrentUser());
}

// POST /api/me { displayName } — create an identity and set the signed cookie.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const displayName =
    typeof body.displayName === "string" ? body.displayName.trim() : "";
  if (!displayName) {
    return NextResponse.json({ error: "Nome é obrigatório." }, { status: 400 });
  }
  const user = await prisma.user.create({ data: { displayName } });
  const res = NextResponse.json(user, { status: 201 });
  res.cookies.set(IDENTITY_COOKIE, makeCookieValue(user.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
  return res;
}
