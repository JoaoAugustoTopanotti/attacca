// Lightweight identity (ADR 0003): a person = a signed cookie pointing at a User
// row. "Real enough" to distinguish two people and make the social gate semi-real
// (userId match). NOT auth — no passwords/email. Swap for real auth later.

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const IDENTITY_COOKIE = "gs_uid";
const SECRET = process.env.GS_COOKIE_SECRET ?? "dev-insecure-change-me";

function hmac(id: string): string {
  return createHmac("sha256", SECRET).update(id).digest("base64url");
}

/** Signed cookie value `userId.signature` — cheap tamper resistance. */
export function makeCookieValue(userId: string): string {
  return `${userId}.${hmac(userId)}`;
}

function verifyCookie(token: string | undefined): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const id = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(id);
  if (
    sig.length !== expected.length ||
    !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }
  return id;
}

/** The current user (from the signed cookie), or null if not identified. */
export async function getCurrentUser() {
  const store = await cookies();
  const id = verifyCookie(store.get(IDENTITY_COOKIE)?.value);
  if (!id) return null;
  return prisma.user.findUnique({ where: { id } });
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
