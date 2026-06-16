"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Me = { id: string; displayName: string } | null;

export default function IdentityWidget() {
  const router = useRouter();
  const [me, setMe] = useState<Me>(null);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((u) => setMe(u))
      .finally(() => setLoaded(true));
  }, []);

  async function identify(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name.trim() }),
      });
      if (res.ok) {
        setMe(await res.json());
        router.refresh(); // re-run server components with the new identity
      }
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;

  if (me) {
    return (
      <span className="muted">
        você é <strong style={{ color: "var(--text)" }}>{me.displayName}</strong>
      </span>
    );
  }

  return (
    <form onSubmit={identify} style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span className="muted">quem é você?</span>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="seu nome"
        style={{ width: 140, padding: "4px 8px", fontSize: "0.85rem" }}
      />
      <button type="submit" disabled={busy} style={{ padding: "4px 10px", fontSize: "0.85rem" }}>
        Entrar
      </button>
    </form>
  );
}
