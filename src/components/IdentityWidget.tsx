"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Me = { id: string; displayName: string; email: string | null } | null;
type Mode = "idle" | "form" | "sent";

const AUTH_ERRORS: Record<string, string> = {
  invalid: "Link inválido. Peça um novo.",
  expired: "O link expirou. Peça um novo.",
};

export default function IdentityWidget() {
  const router = useRouter();
  const [me, setMe] = useState<Me>(null);
  const [loaded, setLoaded] = useState(false);

  const [mode, setMode] = useState<Mode>("idle");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devUrl, setDevUrl] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState("");

  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((u) => setMe(u))
      .finally(() => setLoaded(true));
  }, []);

  // Surface a failed magic link (verify redirects here with ?auth_error=…), then
  // clean the URL so it doesn't stick around.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("auth_error");
    if (code) {
      setError(AUTH_ERRORS[code] ?? "Não foi possível entrar. Tente de novo.");
      setMode("form");
    }
    if (code || params.get("welcome")) {
      params.delete("auth_error");
      params.delete("welcome");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), displayName: name.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Falha ao enviar o link.");
      setSentTo(email.trim());
      setDevUrl(data.devUrl ?? null);
      setMode("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setMe(null);
    setMenuOpen(false);
    setMode("idle");
    setEmail("");
    setName("");
    router.refresh();
  }

  if (!loaded) return null;

  // ── Logged in ────────────────────────────────────────────────────────────
  if (me) {
    return (
      <div className="identity" ref={rootRef}>
        <button
          type="button"
          className="identity-pill identity-pill--btn"
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
        >
          <span className="identity-avatar">{me.displayName[0]?.toUpperCase() ?? "?"}</span>
          {me.displayName}
        </button>
        {menuOpen && (
          <div className="identity-menu">
            <div className="identity-menu-email">
              {me.email ?? "sem e-mail (conta antiga)"}
            </div>
            {!me.email && (
              <p className="identity-menu-hint">
                Sua conta ainda é só por navegador. Saia e entre com um e-mail
                para tornar sua identidade portável.
              </p>
            )}
            <button type="button" className="identity-menu-logout" onClick={logout}>
              Sair
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Link sent ────────────────────────────────────────────────────────────
  if (mode === "sent") {
    return (
      <div className="identity identity-sent">
        <span className="identity-sent-text">
          Link enviado para <strong>{sentTo}</strong>. Confira seu e-mail.
        </span>
        {devUrl && (
          <a className="identity-devlink" href={devUrl}>
            abrir link (dev)
          </a>
        )}
        <button type="button" className="secondary" onClick={() => setMode("form")}>
          trocar
        </button>
      </div>
    );
  }

  // ── Not logged in ──────────────────────────────────────────────────────────
  if (mode === "form") {
    return (
      <form onSubmit={requestLink} className="identity-form identity-form--auth">
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
          placeholder="seu nome (opcional)"
        />
        <button type="submit" disabled={busy} className="secondary">
          {busy ? "…" : "Enviar link"}
        </button>
        {error && <span className="identity-error">{error}</span>}
      </form>
    );
  }

  return (
    <div className="identity">
      {error && <span className="identity-error">{error}</span>}
      <button type="button" className="secondary" onClick={() => setMode("form")}>
        Entrar
      </button>
    </div>
  );
}
