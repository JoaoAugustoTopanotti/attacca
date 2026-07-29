// Login com Google — OpenID Connect, fluxo authorization code com PKCE.
// Escrito à mão (sem next-auth) para não introduzir uma segunda noção de sessão
// ao lado do JWT de identity.ts. O Google apenas AUTENTICA: a âncora da
// identidade continua sendo o e-mail verificado, então entrar pelo Google ou por
// magic link no mesmo endereço cai na mesma conta.

import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
// O Google emite as duas formas conforme o produto; aceitamos ambas.
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

export const googleEnabled = !!(CLIENT_ID && CLIENT_SECRET);

/** Cookies de vida curta que levam o state de CSRF e o verifier do PKCE através
 *  do salto até o Google, mais o caminho opcional de retorno após o login. */
export const STATE_COOKIE = "gs_oauth_state";
export const VERIFIER_COOKIE = "gs_oauth_verifier";
export const REDIRECT_COOKIE = "gs_oauth_redirect";
export const OAUTH_COOKIE_MAX_AGE = 60 * 10; // 10 minutos

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

/** URL para onde o navegador é enviado para o Google autenticar a pessoa. */
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
    // Sempre deixa a pessoa escolher qual conta Google usar.
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${params}`;
}

export type GoogleProfile = { email: string; name: string | null };

const jwks = createRemoteJWKSet(new URL(JWKS_URL));

/**
 * Troca o code de uso único por tokens e verifica assinatura, issuer e audience
 * do id_token contra o JWKS do Google. Devolve o perfil verificado.
 * Lança em qualquer falha; quem chama redireciona com um código de erro.
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
  // E-mail não verificado é recusado: aceitá-lo permitiria assumir uma conta
  // cujo endereço a pessoa não controla.
  if (!email || payload.email_verified !== true) {
    throw new Error("google account has no verified email");
  }
  return { email, name: typeof payload.name === "string" ? payload.name : null };
}
