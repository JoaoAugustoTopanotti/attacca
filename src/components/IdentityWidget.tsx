"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthModal from "@/components/AuthModal";
import { ME_EVENT } from "@/lib/identity-events";

type Me = { id: string; displayName: string; email: string | null } | null;

const AUTH_ERRORS: Record<string, string> = {
  invalid: "Link inválido. Peça um novo.",
  expired: "O link expirou. Peça um novo.",
  google_unconfigured: "Login com Google não está configurado neste servidor.",
  google_denied: "Você cancelou o login com Google.",
  google_state: "Sessão de login expirou. Tente de novo.",
  google_failed: "Não foi possível entrar com o Google. Tente de novo.",
};

export default function IdentityWidget() {
  const router = useRouter();
  const [me, setMe] = useState<Me>(null);
  const [loaded, setLoaded] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((u) => setMe(u))
      .finally(() => setLoaded(true));
  }, []);

  // Salvou o perfil nas configurações → o nome/e-mail aqui em cima muda junto,
  // sem F5 (este fetch acima só roda na montagem).
  useEffect(() => {
    function onMeChanged(event: Event) {
      setMe((event as CustomEvent<Me>).detail);
    }
    window.addEventListener(ME_EVENT, onMeChanged);
    return () => window.removeEventListener(ME_EVENT, onMeChanged);
  }, []);

  // A failed sign-in redirects here with ?auth_error=… — reopen the modal with
  // the reason, then clean the URL so it doesn't stick around on refresh.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("auth_error");
    if (code) {
      setAuthError(AUTH_ERRORS[code] ?? "Não foi possível entrar. Tente de novo.");
      setModalOpen(true);
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

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setMe(null);
    setMenuOpen(false);
    router.refresh();
  }

  function closeModal() {
    setModalOpen(false);
    setAuthError(null);
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
          <span className="identity-name">{me.displayName}</span>
          <span className="identity-caret" aria-hidden />
        </button>
        {menuOpen && (
          <div className="identity-menu">
            <div className="identity-menu-profile">
              <span className="identity-avatar identity-avatar--lg">
                {me.displayName[0]?.toUpperCase() ?? "?"}
              </span>
              <div className="identity-menu-copy">
                <strong>{me.displayName}</strong>
                <span>{me.email ?? "conta local"}</span>
              </div>
            </div>
            {!me.email && (
              <p className="identity-menu-hint">
                Sua conta ainda é só por navegador. Saia e entre com um e-mail
                para tornar sua identidade portável.
              </p>
            )}
            <Link
              href="/settings"
              className="identity-menu-link"
              onClick={() => setMenuOpen(false)}
            >
              Configurações
            </Link>
            <button type="button" className="identity-menu-logout" onClick={logout}>
              Sair
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Signed out ───────────────────────────────────────────────────────────
  return (
    <div className="identity">
      <button
        type="button"
        className="identity-login-btn"
        onClick={() => setModalOpen(true)}
      >
        Entrar
      </button>
      {modalOpen && <AuthModal onClose={closeModal} initialError={authError} />}
    </div>
  );
}
