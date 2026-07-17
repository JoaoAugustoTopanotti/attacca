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

// GET /api/auth/google?redirect=/path — start the Google sign-in hop. Stashes
// the CSRF state, the PKCE verifier and the optional return path in short-lived
// httpOnly cookies, then hands off.
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
