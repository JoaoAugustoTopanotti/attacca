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

// GET /api/auth/verify?token=...  — consume the magic link, start a JWT session,
// then redirect home (or wherever the token asked, e.g. an email change lands
// back on /settings). Errors redirect home with ?auth_error=<code>.
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
  // Retire the legacy cookie now that identity is durable.
  res.cookies.set(LEGACY_IDENTITY_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
