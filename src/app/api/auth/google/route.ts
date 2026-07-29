import { NextResponse } from "next/server";
import { appBaseUrl, safeRedirectPath } from "@/lib/identity";
import {
  googleEnabled,
  createPkce,
  buildAuthUrl,
  oauthCookieOptions,
  STATE_COOKIE,
  VERIFIER_COOKIE,
  REDIRECT_COOKIE,
} from "@/lib/google";

// GET /api/auth/google?redirect=/path — inicia o login pelo Google. Guarda o
// state de CSRF, o verifier do PKCE e o caminho de retorno em cookies httpOnly
// de vida curta, e então redireciona.
export async function GET(request: Request) {
  const base = appBaseUrl(request);
  if (!googleEnabled) {
    return NextResponse.redirect(`${base}/?auth_error=google_unconfigured`);
  }

  const redirect = safeRedirectPath(new URL(request.url).searchParams.get("redirect"));

  const { state, verifier, challenge } = createPkce();
  const res = NextResponse.redirect(buildAuthUrl({ base, state, challenge }));
  res.cookies.set(STATE_COOKIE, state, oauthCookieOptions());
  res.cookies.set(VERIFIER_COOKIE, verifier, oauthCookieOptions());
  if (redirect) res.cookies.set(REDIRECT_COOKIE, redirect, oauthCookieOptions());
  return res;
}
