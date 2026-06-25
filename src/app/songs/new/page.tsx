"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UPLOAD_ACCEPT } from "@/lib/format";

export default function NewSongPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFileName(e.target.files?.[0]?.name ?? null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("O título é obrigatório.");
      return;
    }

    setSubmitting(true);
    const slowTimer = setTimeout(() => setSlow(true), 10_000);

    try {
      // 1. Create song
      const res = await fetch("/api/songs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          artist: artist.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Erro ao criar música.");
      const songId: string = data.id;

      // 2. Upload file (optional)
      const file = fileRef.current?.files?.[0];
      if (file) {
        const form = new FormData();
        form.append("file", file);
        form.append("authorName", "");
        form.append("message", "Upload inicial");

        const upRes = await fetch(`/api/songs/${songId}/revisions`, {
          method: "POST",
          body: form,
        });
        if (!upRes.ok) {
          const upData = await upRes.json();
          throw new Error(upData?.error ?? "Erro no upload.");
        }
      }

      // 3. Go to song workspace
      router.push(`/songs/${songId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
      setSubmitting(false);
    } finally {
      clearTimeout(slowTimer);
    }
  }

  return (
    <div className="new-song-page">
      <div className="new-song-breadcrumb">
        <Link href="/">← Início</Link>
      </div>

      <h1 className="new-song-title">Nova música</h1>
      <p className="new-song-sub">
        Crie uma música e comece a transcrição. Você pode adicionar faixas e
        convidar colaboradores na próxima tela.
      </p>

      <form className="new-song-form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="ns-title">Título</label>
          <input
            id="ns-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ex.: Paranoid Android"
            autoFocus
            disabled={submitting}
          />
        </div>

        <div className="field">
          <label htmlFor="ns-artist">Artista (opcional)</label>
          <input
            id="ns-artist"
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="ex.: Radiohead"
            disabled={submitting}
          />
        </div>

        <div className="field">
          <label>Arquivo Guitar Pro ou MusicXML (opcional)</label>
          <input
            id="ns-file"
            type="file"
            ref={fileRef}
            accept={UPLOAD_ACCEPT}
            onChange={handleFileChange}
            style={{
              position: "absolute",
              opacity: 0,
              pointerEvents: "none",
              width: 1,
              height: 1,
            }}
          />
          <label htmlFor="ns-file" className="upload-zone">
            <div className="upload-zone-icon">🎸</div>
            <div>
              <span className="upload-zone-link">Escolher arquivo</span>{" "}
              ou arraste aqui
            </div>
            <div className="upload-zone-hint">.gp · .gp5 · .gpx · .xml</div>
          </label>
          {fileName && <div className="upload-filename">{fileName}</div>}
        </div>

        {error && <div className="form-error">{error}</div>}
        {slow && (
          <p className="form-slow">
            Servidor acordando (free tier) — pode levar até 30s. Aguarde…
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="btn-new-primary"
        >
          {submitting ? "Criando…" : "Criar e começar →"}
        </button>
      </form>
    </div>
  );
}
