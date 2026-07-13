import { NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/identity";
import {
  googleEnabled,
  createPkce,
  buildAuthUrl,
  oauthCookieOptions,
  STATE_COOKIE,
  VERIFIER_COOKIE,
} from "@/lib/google";

// GET /api/auth/google — start the Google sign-in hop. Stashes the CSRF state
// and the PKCE verifier in short-lived httpOnly cookies, then hands off.
export async function GET(request: Request) {
  const base = appBaseUrl(request);
  if (!googleEnabled) {
    return NextResponse.redirect(`${base}/?auth_error=google_unconfigured`);
  }

  const { state, verifier, challenge } = createPkce();
  const res = NextResponse.redirect(buildAuthUrl({ base, state, challenge }));
  res.cookies.set(STATE_COOKIE, state, oauthCookieOptions());
  res.cookies.set(VERIFIER_COOKIE, verifier, oauthCookieOptions());
  return res;
}
