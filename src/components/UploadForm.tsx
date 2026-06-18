"use client";

import { useEffect, useRef, useState } from "react";
import { UPLOAD_ACCEPT } from "@/lib/format";

export default function UploadForm({
  songId,
  onUploaded,
}: {
  songId: string;
  onUploaded: (newRevisionId: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill author from the cookie identity so the user doesn't have to type
  // their name again. Falls back to "" → the server uses "anon".
  const [authorName, setAuthorName] = useState("");
  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((u) => { if (u?.displayName) setAuthorName(u.displayName); })
      .catch(() => {});
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFileName(e.target.files?.[0]?.name ?? null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Escolha um arquivo.");
      return;
    }

    const form = new FormData();
    form.append("file", file);
    form.append("authorName", authorName);
    form.append("message", message);

    setSubmitting(true);
    try {
      const res = await fetch(`/api/songs/${songId}/revisions`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Falha no upload.");
      setMessage("");
      setFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onUploaded(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro no upload.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Hidden file input — triggered by clicking the label below */}
      <input
        id="upload-file"
        type="file"
        ref={fileInputRef}
        accept={UPLOAD_ACCEPT}
        onChange={handleFileChange}
        style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 1, height: 1 }}
      />
      <label htmlFor="upload-file" className="upload-zone">
        <div className="upload-zone-icon">🎵</div>
        <div>
          <span className="upload-zone-link">Escolher arquivo</span>
          {" "}ou arraste aqui
        </div>
        <div className="upload-zone-hint">.gp · .gp5 · .gpx · .xml</div>
      </label>
      {fileName && <div className="upload-filename">{fileName}</div>}

      <div className="field" style={{ marginTop: 10 }}>
        <label htmlFor="upload-message">Mensagem (opcional)</label>
        <input
          id="upload-message"
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder='ex.: "comecei a guitarra"'
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        style={{ width: "100%", marginTop: 8 }}
      >
        {submitting ? "Enviando…" : "Enviar revisão"}
      </button>
      {error && <div className="form-error">{error}</div>}
    </form>
  );
}
