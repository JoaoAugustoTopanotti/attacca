import { NextResponse } from "next/server";
import {
  consumeLoginToken,
  signSessionToken,
  sessionCookieOptions,
  SESSION_COOKIE,
  LEGACY_IDENTITY_COOKIE,
  appBaseUrl,
  safeRedirectPath,
} from "@/lib/identity";

// GET /api/auth/verify?token= — consome o magic link, abre a sessão JWT e
// redireciona para o destino pedido pelo token (a home, por padrão).
// Em caso de erro, volta para a home com ?auth_error=<código>.
export async function GET(request: Request) {
  const base = appBaseUrl(request);
  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(`${base}/?auth_error=invalid`);
  }

  const result = await consumeLoginToken(token);
  if ("error" in result) {
    return NextResponse.redirect(`${base}/?auth_error=${result.error}`);
  }

  const jwt = await signSessionToken(result.user.id);
  const destination = safeRedirectPath(result.redirectTo) ?? "/?welcome=1";
  const res = NextResponse.redirect(`${base}${destination}`);
  res.cookies.set(SESSION_COOKIE, jwt, sessionCookieOptions());
  // Aposenta o cookie legado: a identidade agora é durável.
  res.cookies.set(LEGACY_IDENTITY_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
