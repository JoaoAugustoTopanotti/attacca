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

// GET /api/auth/google/callback?code=&state= — valida o retorno do Google,
// resolve o usuário pelo e-mail verificado, abre a sessão JWT e volta para casa.
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

  // Proteção de CSRF: o state devolvido pelo Google precisa ser o que este
  // navegador recebeu.
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

  // Mesma âncora de e-mail do magic link: o Google apenas autentica. Um cookie
  // legado remanescente permite anexar este e-mail à conta já existente.
  const claimUserId = await readLegacyCookieUserId();
  const user = await resolveUserForEmail({
    email: profile.email,
    displayName: profile.name,
    claimUserId,
  });

  const jwt = await signSessionToken(user.id);
  // O valor do cookie pode chegar percent-encoded ("%2Fsongs%2Fnew") conforme
  // como foi gravado: decodifica antes de validar (idempotente para caminhos
  // simples).
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
