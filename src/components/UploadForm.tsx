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
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!submitting) { setSlow(false); return; }
    const t = setTimeout(() => setSlow(true), 10_000);
    return () => clearTimeout(t);
  }, [submitting]);

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

    // O autor vem da sessão no servidor (upload exige identidade).
    const form = new FormData();
    form.append("file", file);
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
      {/* Input de arquivo oculto, acionado pelo label abaixo */}
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
      {slow && (
        <p className="form-slow">
          Arquivo grande ou servidor acordando — pode levar até 30s. Aguarde…
        </p>
      )}
      {error && <div className="form-error">{error}</div>}
    </form>
  );
}
