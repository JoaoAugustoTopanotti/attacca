import { NextResponse } from "next/server";
import { issueLoginToken, readLegacyCookieUserId, appBaseUrl } from "@/lib/identity";
import { sendMagicLink, emailConfigured } from "@/lib/email";
import { prisma } from "@/lib/prisma";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/auth/request { email, displayName? }
// Issues a single-use magic link and emails it. Passwordless sign-in / sign-up.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const displayName =
    typeof body.displayName === "string" ? body.displayName.trim() : undefined;

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
  }

  // If the browser still holds the legacy identity cookie, let this email attach
  // to that existing account (preserving its authorship) instead of forking a
  // duplicate identity. Only for an account that has NO email yet — claiming now
  // means "attach in place", and moving someone's email must be an explicit act
  // (POST /api/me/email), never a side effect of an old cookie.
  const legacyId = await readLegacyCookieUserId();
  const legacy = legacyId
    ? await prisma.user.findUnique({ where: { id: legacyId }, select: { id: true, email: true } })
    : null;
  const claimUserId = legacy && !legacy.email ? legacy.id : null;

  const raw = await issueLoginToken({ email, displayName, claimUserId });
  const url = `${appBaseUrl(request)}/api/auth/verify?token=${encodeURIComponent(raw)}`;

  await sendMagicLink(email, url);

  // In dev (no provider), echo the link so the flow is testable without email.
  const devUrl = !emailConfigured && process.env.NODE_ENV !== "production" ? url : undefined;
  return NextResponse.json({ ok: true, sent: emailConfigured, devUrl });
}
