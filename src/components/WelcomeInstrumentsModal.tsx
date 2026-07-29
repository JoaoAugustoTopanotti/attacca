"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { INSTRUMENT_PRESETS } from "@/lib/instrument-presets";
import { emitMeChanged } from "@/lib/identity-events";

/** Passo único de boas-vindas, logo após o primeiro login: "o que você toca?".
 *  É esse dado que faz o mural destacar "precisa do seu instrumento", por isso
 *  é pedido na entrada. Sempre pulável, e depois editável em Configurações. */
export default function WelcomeInstrumentsModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  // Esc pula; trava a página atrás do modal enquanto está aberto.
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

  function toggle(key: string) {
    setSelected((cur) =>
      cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key],
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruments: selected }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não foi possível salvar.");
        return;
      }
      emitMeChanged(data);
      // O mural é um server component e ordena pelo que a pessoa toca.
      router.refresh();
      onClose();
    } catch {
      setError("Falha de rede — tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  if (!mounted) return null;

  const body = (
    <div className="auth-overlay" onMouseDown={onClose} role="presentation">
      <div
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button type="button" className="auth-close" onClick={onClose} aria-label="Pular">
          ✕
        </button>

        <div className="auth-brand" aria-hidden>
          attacca
        </div>

        <h2 id="welcome-title" className="auth-title">
          O que você toca?
        </h2>
        <p className="auth-sub">
          O mural destaca as músicas que esperam justamente o seu instrumento —
          “falta baixo” só vira convite quando chega em quem toca baixo.
        </p>

        {error && <p className="auth-error">{error}</p>}

        <div className="settings-chips welcome-chips">
          {INSTRUMENT_PRESETS.map((p) => {
            const on = selected.includes(p.key);
            return (
              <button
                key={p.key}
                type="button"
                className={`settings-chip ${on ? "on" : ""}`}
                aria-pressed={on}
                onClick={() => toggle(p.key)}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="auth-primary"
          onClick={save}
          disabled={saving || selected.length === 0}
        >
          {saving ? "Salvando…" : "Salvar"}
        </button>
        <button type="button" className="auth-secondary" onClick={onClose} disabled={saving}>
          Agora não
        </button>

        <p className="auth-fine">Dá para mudar quando quiser em Configurações.</p>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
