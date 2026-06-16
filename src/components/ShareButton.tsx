"use client";

import { useState } from "react";

// Step 1 of the relay: A copies the song link and sends it to B.
export default function ShareButton({ songId }: { songId: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}/songs/${songId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. non-HTTPS): show the link to copy manually.
      window.prompt("Copie o link da música:", url);
    }
  }

  return (
    <button type="button" className="secondary" onClick={copy}>
      {copied ? "Link copiado ✓" : "Compartilhar"}
    </button>
  );
}
