"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewSongForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/songs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, artist }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Falha ao criar a música.");
      router.push(`/songs/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="row">
        <div className="field">
          <label htmlFor="title">Título</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ex.: Blackbird"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="artist">Artista</label>
          <input
            id="artist"
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="ex.: The Beatles"
          />
        </div>
        <div className="field-btn">
          <button type="submit" disabled={submitting || title.trim() === ""}>
            {submitting ? "Criando…" : "Criar"}
          </button>
        </div>
      </div>
      {error && <div className="form-error">{error}</div>}
    </form>
  );
}
