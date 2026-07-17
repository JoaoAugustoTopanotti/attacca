"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UPLOAD_ACCEPT } from "@/lib/format";
import AuthModal from "@/components/AuthModal";

type StartMode = "upload" | "blank" | "template";

// Anyone can fill this form; identity is only demanded at save time. The draft
// survives the sign-in round-trip (magic link / Google both navigate away).
const DRAFT_KEY = "attacca:new-song-draft";

export default function NewSongPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [mode, setMode] = useState<StartMode>("blank");
  const [fileName, setFileName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  // Coming back from sign-in: restore what was typed before the modal opened.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      sessionStorage.removeItem(DRAFT_KEY);
      const draft = JSON.parse(raw) as { title?: unknown; artist?: unknown; mode?: unknown };
      if (typeof draft.title === "string") setTitle(draft.title);
      if (typeof draft.artist === "string") setArtist(draft.artist);
      if (draft.mode === "upload" || draft.mode === "blank" || draft.mode === "template") {
        setMode(draft.mode);
      }
    } catch {
      /* malformed draft — start clean */
    }
  }, []);

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

    const file = mode === "upload" ? fileRef.current?.files?.[0] : undefined;
    if (mode === "upload" && !file) {
      setError("Escolha um arquivo Guitar Pro ou MusicXML.");
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
      if (res.status === 401) {
        // Saving needs identity — keep the draft and open the sign-in modal
        // (no red error: this is an invitation, not a failure).
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ title, artist, mode }));
        setAuthOpen(true);
        setSubmitting(false);
        return;
      }
      if (!res.ok) throw new Error(data?.error ?? "Erro ao criar música.");
      const songId: string = data.id;

      // 2. Start the collaboration grid, according to the chosen mode.
      if (mode === "upload" && file) {
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
        router.push(`/songs/${songId}`);
        return;
      }

      if (mode === "blank" || mode === "template") {
        const scRes = await fetch(`/api/songs/${songId}/scaffold`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template: mode === "template" ? "attacca" : "blank" }),
        });
        if (!scRes.ok) {
          const scData = await scRes.json();
          throw new Error(scData?.error ?? "Erro ao criar a grade.");
        }
        router.push(`/songs/${songId}/edit`);
        return;
      }

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
          <label>Como quer começar?</label>
          <div className="start-mode-group">
            <button
              type="button"
              className={`start-mode-option${mode === "blank" ? " selected" : ""}`}
              onClick={() => setMode("blank")}
              disabled={submitting}
            >
              <div className="start-mode-title">Criar do zero</div>
              <div className="start-mode-desc">
                Abre o editor visual com uma trilha de guitarra em branco.
              </div>
            </button>
            <button
              type="button"
              className={`start-mode-option${mode === "template" ? " selected" : ""}`}
              onClick={() => setMode("template")}
              disabled={submitting}
            >
              <div className="start-mode-title">Usar template do attacca</div>
              <div className="start-mode-desc">
                Começa com guitarra + baixo de exemplo já preenchidos.
              </div>
            </button>
            <button
              type="button"
              className={`start-mode-option${mode === "upload" ? " selected" : ""}`}
              onClick={() => setMode("upload")}
              disabled={submitting}
            >
              <div className="start-mode-title">Enviar arquivo</div>
              <div className="start-mode-desc">
                Já tem a partitura pronta? Envie um Guitar Pro ou MusicXML.
              </div>
            </button>
          </div>
        </div>

        {mode === "upload" && (
          <div className="field">
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
        )}

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

      {authOpen && (
        <AuthModal
          onClose={() => setAuthOpen(false)}
          reason="Logue para poder criar uma música!"
          redirectTo="/songs/new"
        />
      )}
    </div>
  );
}
