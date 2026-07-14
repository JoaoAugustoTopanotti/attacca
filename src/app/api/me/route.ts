import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/identity";
import { updateProfile } from "@/lib/profile";

// GET /api/me — the current identity (or null). Sign-in happens through the
// magic-link / Google flows; there is no "create identity from a name" here.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json(null);
  return NextResponse.json({
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    instruments: user.instruments,
  });
}

// PATCH /api/me { displayName?, instruments? } — edit my own profile.
// Changing the EMAIL is not done here: it needs proof of the new inbox
// (POST /api/me/email → magic link).
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Entre para editar seu perfil." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const displayName = typeof body.displayName === "string" ? body.displayName : undefined;
  const instruments =
    Array.isArray(body.instruments) && body.instruments.every((k: unknown) => typeof k === "string")
      ? (body.instruments as string[])
      : undefined;

  try {
    const updated = await updateProfile(user.id, { displayName, instruments });
    return NextResponse.json({
      id: updated.id,
      displayName: updated.displayName,
      email: updated.email,
      instruments: updated.instruments,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Não foi possível salvar.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
