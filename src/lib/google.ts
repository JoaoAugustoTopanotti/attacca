// Google sign-in — OpenID Connect authorization-code flow with PKCE.
// Hand-rolled (no next-auth) to stay consistent with our own JWT session in
// identity.ts. Google is only an *authenticator*: the identity anchor stays the
// verified email (see ADR 0004), so signing in with Google or with a magic link
// on the same address lands on the same account.

import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
// Google issues both forms across products; accept either.
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

export const googleEnabled = !!(CLIENT_ID && CLIENT_SECRET);

/** Short-lived cookies carrying the CSRF state + PKCE verifier across the hop,
 *  plus the optional same-origin path to land on after sign-in. */
export const STATE_COOKIE = "gs_oauth_state";
export const VERIFIER_COOKIE = "gs_oauth_verifier";
export const REDIRECT_COOKIE = "gs_oauth_redirect";
export const OAUTH_COOKIE_MAX_AGE = 60 * 10; // 10 minutes

export const oauthCookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  maxAge: OAUTH_COOKIE_MAX_AGE,
});

export const redirectUri = (base: string) => `${base}/api/auth/google/callback`;

const b64url = (b: Buffer) => b.toString("base64url");

export function createPkce() {
  const state = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { state, verifier, challenge };
}

/** The URL we send the browser to, to let Google authenticate the person. */
export function buildAuthUrl(args: {
  base: string;
  state: string;
  challenge: string;
}): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID!,
    redirect_uri: redirectUri(args.base),
    response_type: "code",
    scope: "openid email profile",
    state: args.state,
    code_challenge: args.challenge,
    code_challenge_method: "S256",
    // Always let the person pick which Google account (ChatGPT-style).
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${params}`;
}

export type GoogleProfile = { email: string; name: string | null };

const jwks = createRemoteJWKSet(new URL(JWKS_URL));

/**
 * Exchange the one-time code for tokens, then verify the ID token's signature,
 * issuer and audience against Google's JWKS. Returns the verified profile.
 * Throws on any failure — the caller redirects with an error code.
 */
export async function exchangeCodeForProfile(args: {
  code: string;
  verifier: string;
  base: string;
}): Promise<GoogleProfile> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: args.code,
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      redirect_uri: redirectUri(args.base),
      grant_type: "authorization_code",
      code_verifier: args.verifier,
    }),
  });
  if (!res.ok) {
    throw new Error(`token exchange failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) throw new Error("no id_token in token response");

  const { payload } = await jwtVerify(data.id_token, jwks, {
    issuer: ISSUERS,
    audience: CLIENT_ID!,
  });

  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  // Never trust an unverified Google email: it would let someone claim an
  // account whose address they don't actually control.
  if (!email || payload.email_verified !== true) {
    throw new Error("google account has no verified email");
  }
  return { email, name: typeof payload.name === "string" ? payload.name : null };
}
