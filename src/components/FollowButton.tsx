"use client";

import { useEffect, useState } from "react";

// The demand side of the mural: a learner who sees "falta baixo" follows the
// song and gets told when it's delivered — instead of having to keep checking.
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
    setWatching(next); // optimistic
    try {
      const res = await fetch(`/api/songs/${songId}/watch`, {
        method: next ? "POST" : "DELETE",
      });
      if (!res.ok) setWatching(!next); // revert on failure
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
