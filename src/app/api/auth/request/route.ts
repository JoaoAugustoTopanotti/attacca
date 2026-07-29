import { NextResponse } from "next/server";
import {
  issueLoginToken,
  readLegacyCookieUserId,
  appBaseUrl,
  safeRedirectPath,
} from "@/lib/identity";
import { sendMagicLink, emailConfigured } from "@/lib/email";
import { prisma } from "@/lib/prisma";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/auth/request { email, displayName?, redirectTo? }
// Emite e envia por e-mail um magic link de uso único. Serve tanto para entrar
// quanto para criar conta, sem senha.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const displayName =
    typeof body.displayName === "string" ? body.displayName.trim() : undefined;
  // Para onde o magic link leva depois de consumido.
  const redirectTo = safeRedirectPath(
    typeof body.redirectTo === "string" ? body.redirectTo : null,
  );

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
  }

  // Se o navegador ainda tem o cookie de identidade legado, anexa este e-mail à
  // conta existente, preservando sua autoria, em vez de criar uma duplicata.
  // Só vale para conta ainda sem e-mail: mover o e-mail de alguém tem que ser
  // ato explícito (POST /api/me/email), nunca efeito colateral de cookie antigo.
  const legacyId = await readLegacyCookieUserId();
  const legacy = legacyId
    ? await prisma.user.findUnique({ where: { id: legacyId }, select: { id: true, email: true } })
    : null;
  const claimUserId = legacy && !legacy.email ? legacy.id : null;

  const raw = await issueLoginToken({ email, displayName, claimUserId, redirectTo });
  const url = `${appBaseUrl(request)}/api/auth/verify?token=${encodeURIComponent(raw)}`;

  await sendMagicLink(email, url);

  // Em dev, sem provedor de e-mail, devolve o link para o fluxo ser testável.
  const devUrl = !emailConfigured && process.env.NODE_ENV !== "production" ? url : undefined;
  return NextResponse.json({ ok: true, sent: emailConfigured, devUrl });
}
