"use client";

import { useState } from "react";
import NewSongForm from "./NewSongForm";

/** Collapses the "Nova música" form behind a button on the home page. */
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
