"use client";

import { useRef, useState } from "react";
import { UPLOAD_ACCEPT } from "@/lib/format";

export default function UploadForm({
  songId,
  onUploaded,
}: {
  songId: string;
  onUploaded: (newRevisionId: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [authorName, setAuthorName] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      if (!res.ok) {
        throw new Error(data?.error ?? "Falha no upload.");
      }
      // Reset and hand the new revision id back to the workspace.
      setMessage("");
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
      <div className="field">
        <label htmlFor="file">Arquivo (Guitar Pro ou MusicXML)</label>
        <input id="file" type="file" ref={fileInputRef} accept={UPLOAD_ACCEPT} />
      </div>
      <div className="field">
        <label htmlFor="author">Seu nome</label>
        <input
          id="author"
          type="text"
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          placeholder="anon"
        />
      </div>
      <div className="field">
        <label htmlFor="message">Mensagem (opcional)</label>
        <input
          id="message"
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ex: comecei a guitarra"
        />
      </div>
      <button type="submit" disabled={submitting}>
        {submitting ? "Enviando…" : "Enviar revisão"}
      </button>
      {error && <div className="form-error">{error}</div>}
    </form>
  );
}
