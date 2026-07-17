import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  appBaseUrl,
  resolveUserForEmail,
  readLegacyCookieUserId,
  signSessionToken,
  sessionCookieOptions,
  SESSION_COOKIE,
  LEGACY_IDENTITY_COOKIE,
  safeRedirectPath,
} from "@/lib/identity";
import {
  googleEnabled,
  exchangeCodeForProfile,
  STATE_COOKIE,
  VERIFIER_COOKIE,
  REDIRECT_COOKIE,
} from "@/lib/google";

const expire = { path: "/", maxAge: 0 };

// GET /api/auth/google/callback?code=&state= — verify the hop, resolve the user
// from the verified Google email, start a JWT session, and land them home.
export async function GET(request: Request) {
  const base = appBaseUrl(request);
  const fail = (code: string) => {
    const res = NextResponse.redirect(`${base}/?auth_error=${code}`);
    res.cookies.set(STATE_COOKIE, "", expire);
    res.cookies.set(VERIFIER_COOKIE, "", expire);
    res.cookies.set(REDIRECT_COOKIE, "", expire);
    return res;
  };

  if (!googleEnabled) return fail("google_unconfigured");

  const url = new URL(request.url);
  if (url.searchParams.get("error")) return fail("google_denied");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const store = await cookies();
  const expectedState = store.get(STATE_COOKIE)?.value;
  const verifier = store.get(VERIFIER_COOKIE)?.value;

  // CSRF: the state echoed by Google must match the one we set on this browser.
  if (!code || !state || !expectedState || !verifier || state !== expectedState) {
    return fail("google_state");
  }

  let profile;
  try {
    profile = await exchangeCodeForProfile({ code, verifier, base });
  } catch (e) {
    console.error("google sign-in failed", e);
    return fail("google_failed");
  }

  // Same email anchor as the magic link: Google just authenticates. A lingering
  // legacy cookie lets this email attach to that existing account.
  const claimUserId = await readLegacyCookieUserId();
  const user = await resolveUserForEmail({
    email: profile.email,
    displayName: profile.name,
    claimUserId,
  });

  const jwt = await signSessionToken(user.id);
  // The cookie value may arrive percent-encoded ("%2Fsongs%2Fnew") depending on
  // how it was set; decode before validating (idempotent for plain paths).
  let redirectRaw = store.get(REDIRECT_COOKIE)?.value ?? null;
  try {
    if (redirectRaw) redirectRaw = decodeURIComponent(redirectRaw);
  } catch {
    redirectRaw = null;
  }
  const destination = safeRedirectPath(redirectRaw) ?? "/?welcome=1";
  const res = NextResponse.redirect(`${base}${destination}`);
  res.cookies.set(SESSION_COOKIE, jwt, sessionCookieOptions());
  res.cookies.set(STATE_COOKIE, "", expire);
  res.cookies.set(VERIFIER_COOKIE, "", expire);
  res.cookies.set(REDIRECT_COOKIE, "", expire);
  res.cookies.set(LEGACY_IDENTITY_COOKIE, "", expire);
  return res;
}
