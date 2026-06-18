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
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  // Don't render anything while loading to avoid layout shift.
  if (!loaded) return null;

  if (me) {
    return (
      <div className="identity-pill">
        <div className="identity-avatar">
          {me.displayName[0].toUpperCase()}
        </div>
        {me.displayName}
      </div>
    );
  }

  return (
    <form onSubmit={identify} className="identity-form">
      <span className="identity-prompt">quem é você?</span>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="seu nome"
      />
      <button type="submit" disabled={busy} className="secondary">
        {busy ? "…" : "Entrar"}
      </button>
    </form>
  );
}
