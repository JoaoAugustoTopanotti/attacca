// Identidade e autenticação. A âncora é um E-MAIL VERIFICADO, com login sem
// senha (magic link) e sessão em cookie JWT assinado. Isso torna a identidade
// durável entre aparelhos: limpar o cookie não faz a pessoa perder a autoria
// das contribuições, como acontecia no modelo antigo de cookie-como-identidade.
//
//   login:      e-mail → magic link de uso único → sessão JWT (cookie httpOnly)
//   identidade: getCurrentUser() verifica o JWT e carrega o User
//
// `readLegacyCookieUserId` é o único resquício do cookie antigo: uma ponte de
// migração que anexa um e-mail a uma conta pré-existente, para os primeiros
// usuários não perderem suas contribuições. Removível depois da migração.

import { cookies } from "next/headers";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

// Resolvido de forma preguiçosa para o erro estourar no primeiro uso em
// runtime (não no build): sem segredo em produção, qualquer sessão poderia
// ser forjada com o fallback público — melhor cair do que abrir.
let cachedSecretKey: Uint8Array | null = null;
function secretKey(): Uint8Array {
  if (!cachedSecretKey) {
    const secret = process.env.GS_AUTH_SECRET ?? process.env.GS_COOKIE_SECRET;
    if (!secret && process.env.NODE_ENV === "production") {
      throw new Error(
        "GS_AUTH_SECRET (ou GS_COOKIE_SECRET) é obrigatório em produção.",
      );
    }
    cachedSecretKey = new TextEncoder().encode(secret ?? "dev-insecure-change-me");
  }
  return cachedSecretKey;
}

export const SESSION_COOKIE = "gs_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 dias
const TOKEN_TTL_MS = 1000 * 60 * 30; // validade do magic link: 30 minutos

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
  };
}

// ── Sessão JWT ────────────────────────────────────────────────────────────────

/** Assina o JWT de sessão de um usuário (HS256, expira em 30 dias). */
export async function signSessionToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secretKey());
}

async function userIdFromToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** O usuário atual, a partir da sessão JWT verificada, ou null. */
export async function getCurrentUser() {
  const store = await cookies();
  const userId = await userIdFromToken(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

// ── Tokens de magic link ──────────────────────────────────────────────────────

const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

function deriveName(email: string): string {
  const local = email.split("@")[0] || "músico";
  return local.replace(/[._-]+/g, " ").trim() || "músico";
}

/**
 * Emite um token de magic link de uso único. Devolve o token em claro, que vai
 * apenas na URL do e-mail; o banco guarda só o hash, para um vazamento da tabela
 * não permitir login. `claimUserId` anexa este e-mail a uma conta existente
 * (ponte do cookie legado ou troca de e-mail nas configurações); `redirectTo` é
 * onde o link aterrissa depois de consumido.
 */
export async function issueLoginToken(args: {
  email: string;
  displayName?: string | null;
  claimUserId?: string | null;
  redirectTo?: string | null;
}): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await prisma.loginToken.create({
    data: {
      email: args.email,
      tokenHash: hashToken(raw),
      displayName: args.displayName ?? null,
      claimUserId: args.claimUserId ?? null,
      redirectTo: args.redirectTo ?? null,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });
  // Faxina best-effort: sem isto, hash+e-mail de todo login ficariam no banco
  // para sempre. Um dia de margem preserva o diagnóstico de "link expirado".
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  prisma.loginToken
    .deleteMany({ where: { expiresAt: { lt: dayAgo } } })
    .catch(() => {});
  return raw;
}

/**
 * Único ponto em que um e-mail verificado vira um User, compartilhado por todos
 * os métodos de login (magic link, Google). O e-mail é a âncora da identidade:
 *   1. e-mail já conhecido → aquela conta (verificada no primeiro login)
 *   2. claimUserId         → anexa o e-mail àquela conta in place, preservando
 *                            a autoria (ponte do cookie legado e troca de
 *                            e-mail nas configurações)
 *   3. caso contrário      → cria uma conta nova
 *
 * (1) tem precedência sobre (2): se o e-mail já pertence a outra conta, provar
 * o controle dele entra NAQUELA conta em vez de movê-lo. A rota de troca de
 * e-mail já recusa endereço em uso, então esse caso é residual.
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
    const target = await prisma.user.findUnique({ where: { id: args.claimUserId } });
    if (target) {
      return prisma.user.update({
        where: { id: target.id },
        data: { email, emailVerified: now, displayName: proposed || target.displayName },
      });
    }
  }

  return prisma.user.create({
    data: { email, emailVerified: now, displayName: proposed || deriveName(email) },
  });
}

/**
 * Consome um token de magic link: valida, resolve/cria o User com o e-mail
 * verificado e marca o token como usado. Devolve o usuário ou um código de erro.
 */
export async function consumeLoginToken(
  raw: string,
): Promise<
  { user: CurrentUser; redirectTo: string | null } | { error: "invalid" | "expired" }
> {
  const token = await prisma.loginToken.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!token || token.consumedAt) return { error: "invalid" };
  if (token.expiresAt.getTime() < Date.now()) return { error: "expired" };

  // Reivindica o token ATOMICAMENTE antes de resolver o usuário: dois requests
  // concorrentes com o mesmo link passariam ambos na checagem acima, mas só um
  // vence este update condicional — uso único de verdade.
  const claimed = await prisma.loginToken.updateMany({
    where: { id: token.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (claimed.count === 0) return { error: "invalid" };

  const user = await resolveUserForEmail({
    email: token.email,
    displayName: token.displayName,
    claimUserId: token.claimUserId,
  });

  // Queima os demais tokens pendentes do mesmo e-mail.
  await prisma.loginToken.updateMany({
    where: { email: token.email, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  return { user, redirectTo: token.redirectTo };
}

// ── Ponte de migração do cookie legado (transitória) ──────────────────────────

const LEGACY_COOKIE = "gs_uid";

/** Lê o antigo cookie de userId assinado, se ainda existir. Serve apenas para o
 *  usuário antigo anexar um e-mail à conta que já tem. Removível depois. */
export async function readLegacyCookieUserId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(LEGACY_COOKIE)?.value;
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const id = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const legacySecret = process.env.GS_COOKIE_SECRET;
  // Sem o segredo legado em produção, não dá para verificar a assinatura —
  // aceitar contra o fallback público deixaria forjar o cookie e reivindicar
  // a autoria de qualquer conta antiga.
  if (!legacySecret && process.env.NODE_ENV === "production") return null;
  const expected = createHmac("sha256", legacySecret ?? "dev-insecure-change-me")
    .update(id)
    .digest("base64url");
  try {
    if (sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return id;
    }
  } catch {
    /* cookie malformado */
  }
  return null;
}

export const LEGACY_IDENTITY_COOKIE = LEGACY_COOKIE;

// ── Segurança de redirect ─────────────────────────────────────────────────────

/** Só caminhos da mesma origem ("/songs/new", "/settings?…") valem como destino
 *  pós-login. Aceitar URL completa ou protocol-relative transformaria o fluxo de
 *  autenticação num open redirect. */
export function safeRedirectPath(path: string | null | undefined): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return null;
  return path;
}

// ── URL base (para montar links absolutos de e-mail atrás de um proxy) ────────

export function appBaseUrl(request: Request): string {
  const envUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const h = request.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}
