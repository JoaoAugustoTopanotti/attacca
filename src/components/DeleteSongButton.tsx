"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Excluir a própria música — só o dono vê o botão. Confirmação estilo GitHub:
// digitar o título exato libera o botão (e o servidor confere de novo).
// Música sem dono (seed/legado) não tem quem possa apagar o trabalho de todos.
export default function DeleteSongButton({
  songId,
  songTitle,
  ownerId,
}: {
  songId: string;
  songTitle: string;
  ownerId: string | null;
}) {
  const [meId, setMeId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((m) => setMeId(m?.id ?? null))
      .catch(() => {});
  }, []);

  if (!ownerId || meId !== ownerId) return null;

  return (
    <>
      <button
        type="button"
        className="delete-song-btn"
        onClick={() => setOpen(true)}
      >
        Excluir
      </button>
      {open && (
        <DeleteModal
          songId={songId}
          songTitle={songTitle}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function DeleteModal({
  songId,
  songTitle,
  onClose,
}: {
  songId: string;
  songTitle: string;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Esc closes; lock the page behind the modal while it's open (like AuthModal).
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

  const matches = typed.trim() === songTitle;

  async function destroy(e: React.FormEvent) {
    e.preventDefault();
    if (!matches || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/songs/${songId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmTitle: typed.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Falha ao excluir a música.");
      }
      // Gone for good — land back on the mural.
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro.");
      setBusy(false);
    }
  }

  const body = (
    <div className="auth-overlay" onMouseDown={onClose} role="presentation">
      <div
        className="auth-modal danger-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-song-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="auth-close"
          onClick={onClose}
          aria-label="Fechar"
        >
          ✕
        </button>

        <h2 id="delete-song-title" className="auth-title">
          Excluir esta música?
        </h2>
        <p className="auth-sub">
          Isso apaga <strong>{songTitle}</strong> com todas as trilhas,
          contribuições, propostas e o histórico — para todo mundo que
          participou, não só para você. Não dá para desfazer.
        </p>

        {error && <p className="auth-error">{error}</p>}

        <form onSubmit={destroy} className="auth-form">
          <label className="danger-label" htmlFor="delete-song-confirm">
            digite <strong>{songTitle}</strong> para confirmar
          </label>
          <input
            id="delete-song-confirm"
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={songTitle}
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            className="danger-confirm"
            disabled={!matches || busy}
          >
            {busy ? "Excluindo…" : "Excluir esta música"}
          </button>
        </form>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
