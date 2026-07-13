// Identity & auth. Durable, cross-device identity anchored to a VERIFIED EMAIL,
// with passwordless (magic-link) sign-in and a signed JWT session cookie —
// replacing the old "identity = a signed userId cookie" model (which lost your
// authorship the moment you cleared the cookie or switched devices).
//
//   sign-in:  email → single-use magic link → JWT session (httpOnly cookie)
//   identity: getCurrentUser() reads + verifies the JWT and loads the User
//
// The only remaining touch of the legacy cookie is a one-time migration bridge
// (readLegacyCookieUserId), used solely to attach an email to a pre-existing
// account so early users keep their contributions. Remove once migrated.

import { cookies } from "next/headers";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

const SECRET =
  process.env.GS_AUTH_SECRET ??
  process.env.GS_COOKIE_SECRET ??
  "dev-insecure-change-me";
const secretKey = new TextEncoder().encode(SECRET);

export const SESSION_COOKIE = "gs_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const TOKEN_TTL_MS = 1000 * 60 * 30; // magic link valid for 30 minutes

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
  };
}

// ── JWT session ─────────────────────────────────────────────────────────────

/** Sign a session JWT for a user (HS256, 30-day expiry). */
export async function signSessionToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secretKey);
}

async function userIdFromToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ["HS256"] });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** The current user (from the verified JWT session), or null. */
export async function getCurrentUser() {
  const store = await cookies();
  const userId = await userIdFromToken(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

// ── Magic-link tokens ─────────────────────────────────────────────────────────

const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

function deriveName(email: string): string {
  const local = email.split("@")[0] || "músico";
  return local.replace(/[._-]+/g, " ").trim() || "músico";
}

/**
 * Issue a single-use magic-link token for an email. Returns the RAW token (goes
 * only into the emailed URL) — we persist just its hash. `claimUserId` lets a
 * legacy cookie user attach this email to their existing account.
 */
export async function issueLoginToken(args: {
  email: string;
  displayName?: string | null;
  claimUserId?: string | null;
}): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await prisma.loginToken.create({
    data: {
      email: args.email,
      tokenHash: hashToken(raw),
      displayName: args.displayName ?? null,
      claimUserId: args.claimUserId ?? null,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });
  return raw;
}

/**
 * The single place a verified email becomes a User — shared by every sign-in
 * method (magic link, Google). Email is the identity anchor:
 *   1. email already known  → that account (verify it on first sign-in)
 *   2. legacy cookie user   → attach the email in place (keeps authorship)
 *   3. otherwise            → create a new account
 */
export async function resolveUserForEmail(args: {
  email: string;
  displayName?: string | null;
  claimUserId?: string | null;
}): Promise<CurrentUser> {
  const { email } = args;
  const now = new Date();
  const proposed = args.displayName?.trim();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.emailVerified) return existing;
    return prisma.user.update({ where: { id: existing.id }, data: { emailVerified: now } });
  }

  if (args.claimUserId) {
    const legacy = await prisma.user.findUnique({ where: { id: args.claimUserId } });
    if (legacy && !legacy.email) {
      return prisma.user.update({
        where: { id: legacy.id },
        data: { email, emailVerified: now, displayName: proposed || legacy.displayName },
      });
    }
  }

  return prisma.user.create({
    data: { email, emailVerified: now, displayName: proposed || deriveName(email) },
  });
}

/**
 * Consume a magic-link token: validate → resolve/create the User (verifying the
 * email) → mark it used. Returns the user on success, or an error code.
 */
export async function consumeLoginToken(
  raw: string,
): Promise<{ user: CurrentUser } | { error: "invalid" | "expired" }> {
  const token = await prisma.loginToken.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!token || token.consumedAt) return { error: "invalid" };
  if (token.expiresAt.getTime() < Date.now()) return { error: "expired" };

  const user = await resolveUserForEmail({
    email: token.email,
    displayName: token.displayName,
    claimUserId: token.claimUserId,
  });

  // Burn this token and any other outstanding ones for the email.
  await prisma.loginToken.updateMany({
    where: { email: token.email, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  return { user };
}

// ── Legacy migration bridge (transitional) ────────────────────────────────────

const LEGACY_COOKIE = "gs_uid";

/** Read the OLD signed-userId cookie, if still present. Used ONLY to let an
 *  early user attach an email to their existing account. Safe to delete later. */
export async function readLegacyCookieUserId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(LEGACY_COOKIE)?.value;
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const id = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const legacySecret = process.env.GS_COOKIE_SECRET ?? "dev-insecure-change-me";
  const expected = createHmac("sha256", legacySecret).update(id).digest("base64url");
  try {
    if (sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return id;
    }
  } catch {
    /* malformed */
  }
  return null;
}

export const LEGACY_IDENTITY_COOKIE = LEGACY_COOKIE;

// ── Base URL (for building absolute magic-link URLs behind a proxy) ────────────

export function appBaseUrl(request: Request): string {
  const envUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const h = request.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}
