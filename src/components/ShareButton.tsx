"use client";

import { useState } from "react";

// Copies the song's URL to the clipboard. Primary sharing mechanism for the relay.
export default function ShareButton({ songId }: { songId: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}/songs/${songId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. non-HTTPS): prompt user to copy manually.
      window.prompt("Copie o link:", url);
    }
  }

  return (
    <button type="button" className="share-btn" onClick={copy}>
      {copied ? "✓ copiado" : "↗ Compartilhar"}
    </button>
  );
}
