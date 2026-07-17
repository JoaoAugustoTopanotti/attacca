"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  onClose: () => void;
  /** Error carried over from a failed redirect (?auth_error=…). */
  initialError?: string | null;
  /** Why the modal opened (e.g. "Logue para poder criar uma música!") —
   *  replaces the default title. */
  reason?: string;
  /** Same-origin path to land on after signing in (both providers). */
  redirectTo?: string;
};

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

export default function AuthModal({ onClose, initialError, reason, redirectTo }: Props) {
  const [mounted, setMounted] = useState(false);
  const [providers, setProviders] = useState<{ google: boolean } | null>(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [devUrl, setDevUrl] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then(setProviders)
      .catch(() => setProviders({ google: false }));
  }, []);

  // Esc closes; lock the page behind the modal while it's open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          displayName: name.trim() || undefined,
          redirectTo,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Falha ao enviar o link.");
      setDevUrl(data.devUrl ?? null);
      setSentTo(email.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro.");
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;

  const body = (
    <div className="auth-overlay" onMouseDown={onClose} role="presentation">
      <div
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button type="button" className="auth-close" onClick={onClose} aria-label="Fechar">
          ✕
        </button>

        <div className="auth-brand" aria-hidden>
          attacca
        </div>

        {sentTo ? (
          // ── Magic link sent ────────────────────────────────────────────
          <>
            <h2 id="auth-title" className="auth-title">
              Confira seu e-mail
            </h2>
            <p className="auth-sub">
              Enviamos um link de acesso para <strong>{sentTo}</strong>. Ele expira
              em 30 minutos e só funciona uma vez.
            </p>
            {devUrl && (
              <a className="auth-devlink" href={devUrl}>
                Abrir link (modo dev)
              </a>
            )}
            <button
              type="button"
              className="auth-secondary"
              onClick={() => {
                setSentTo(null);
                setDevUrl(null);
              }}
            >
              Usar outro e-mail
            </button>
          </>
        ) : (
          // ── Sign in ────────────────────────────────────────────────────
          <>
            <h2 id="auth-title" className="auth-title">
              {reason ?? "Entrar no attacca"}
            </h2>
            <p className="auth-sub">
              Sua identidade fica ligada ao e-mail — sua autoria te acompanha em
              qualquer aparelho.
            </p>

            {error && <p className="auth-error">{error}</p>}

            {providers?.google && (
              <a
                className="auth-google"
                href={
                  redirectTo
                    ? `/api/auth/google?redirect=${encodeURIComponent(redirectTo)}`
                    : "/api/auth/google"
                }
              >
                <GoogleMark />
                Continuar com Google
              </a>
            )}

            {providers?.google && (
              <div className="auth-divider">
                <span>ou</span>
              </div>
            )}

            <form onSubmit={requestLink} className="auth-form">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                autoFocus
                required
              />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome (opcional)"
              />
              <button type="submit" className="auth-primary" disabled={busy}>
                {busy ? "Enviando…" : "Continuar com e-mail"}
              </button>
            </form>

            <p className="auth-fine">
              Sem senha. Enviamos um link de acesso de uso único.
            </p>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
