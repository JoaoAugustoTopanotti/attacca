"use client";

import { useEffect, useState } from "react";

// O lado da demanda no mural: quem vê "falta baixo" segue a música e é avisado
// quando a trilha for entregue, em vez de ter que voltar para conferir.
export default function FollowButton({ songId }: { songId: string }) {
  const [watching, setWatching] = useState(false);
  const [canWatch, setCanWatch] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/songs/${songId}/watch`)
      .then((r) => r.json())
      .then((d) => {
        setWatching(!!d.watching);
        setCanWatch(!!d.canWatch);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [songId]);

  async function toggle() {
    if (busy) return;
    if (!canWatch) {
      alert("Identifique-se no topo da página para seguir esta música.");
      return;
    }
    setBusy(true);
    const next = !watching;
    setWatching(next); // atualização otimista
    try {
      const res = await fetch(`/api/songs/${songId}/watch`, {
        method: next ? "POST" : "DELETE",
      });
      if (!res.ok) setWatching(!next); // reverte em caso de falha
    } catch {
      setWatching(!next);
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;

  return (
    <button
      type="button"
      className={`follow-btn${watching ? " following" : ""}`}
      onClick={toggle}
      disabled={busy}
      title={
        watching
          ? "Você é avisado quando algo é entregue nesta música"
          : "Seja avisado quando faltas forem preenchidas"
      }
    >
      {watching ? "★ Seguindo" : "☆ Seguir"}
    </button>
  );
}
