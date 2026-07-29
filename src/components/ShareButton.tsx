"use client";

import { useState } from "react";

// Copia a URL da música para a área de transferência: é assim que o convite ao
// revezamento circula.
export default function ShareButton({ songId }: { songId: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}/songs/${songId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard bloqueado (fora de HTTPS, por exemplo): pede a cópia manual.
      window.prompt("Copie o link:", url);
    }
  }

  return (
    <button type="button" className="share-btn" onClick={copy}>
      {copied ? "✓ copiado" : "↗ Compartilhar"}
    </button>
  );
}
