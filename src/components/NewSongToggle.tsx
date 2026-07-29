"use client";

import { useState } from "react";
import NewSongForm from "./NewSongForm";

/** Recolhe o formulário "Nova música" atrás de um botão, na home. */
export default function NewSongToggle() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="new-song-toggle">
        <button className="btn-secondary" onClick={() => setOpen(true)}>
          + Nova música
        </button>
      </div>
    );
  }

  return (
    <div className="new-song-panel">
      <div className="new-song-panel-header">
        <p className="new-song-caption">Nova música</p>
        <button
          className="btn-ghost"
          onClick={() => setOpen(false)}
          aria-label="Fechar"
        >
          ✕
        </button>
      </div>
      <NewSongForm />
    </div>
  );
}
