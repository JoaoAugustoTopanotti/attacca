"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Notif = {
  id: string;
  type: string;
  songId: string;
  songTitle: string;
  actorName: string;
  trackName: string | null;
  count: number | null;
  message: string;
  read: boolean;
  createdAt: string;
};

// Aba da página da música em que a notificação aterrissa.
function hashForType(type: string): string {
  switch (type) {
    case "proposal_received":
      return "#propostas"; // o dono cai direto na fila de revisão
    case "slot_declared":
      return "#colaborar"; // "falta baixo": leva a quem vai preencher
    default:
      return ""; // aceite, recusa e progresso levam ao player
  }
}

const ICONS: Record<string, string> = {
  proposal_received: "✎",
  proposal_accepted: "✓",
  proposal_rejected: "✕",
  track_progress: "♪",
  slot_declared: "＋",
};

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "agora";
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

const POLL_MS = 30_000;

export default function NotificationBell() {
  const router = useRouter();
  const [identified, setIdentified] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.notifications ?? []);
      setUnread(data.unread ?? 0);
    } catch {
      /* offline ou falha passageira: mantém o último estado */
    }
  }, []);

  // O sino só aparece para quem está identificado: notificação tem destinatário.
  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((u) => setIdentified(!!u))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!identified) return;
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [identified, load]);

  // Fecha o dropdown ao clicar fora dele.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function markRead(ids?: string[]) {
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids ? { ids } : {}),
      });
    } catch {
      /* best-effort: marcar como lida nunca bloqueia a navegação */
    }
  }

  async function openItem(n: Notif) {
    setOpen(false);
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      void markRead([n.id]);
    }
    router.push(`/songs/${n.songId}${hashForType(n.type)}`);
  }

  async function markAll() {
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnread(0);
    await markRead();
  }

  if (!identified) return null;

  return (
    <div className="notif" ref={rootRef}>
      <button
        type="button"
        className="notif-bell"
        aria-label="Notificações"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg
          className="notif-bell-icon"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="notif-badge">{unread > 9 ? "9+" : unread}</span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown" role="menu">
          <div className="notif-head">
            <span>Notificações</span>
            {unread > 0 && (
              <button type="button" className="notif-markall" onClick={markAll}>
                marcar todas como lidas
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="notif-empty">
              Nada por aqui ainda. Quando alguém propuser, aceitar ou entregar
              algo numa música sua (ou que você segue), aparece aqui.
            </p>
          ) : (
            <ul className="notif-list">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`notif-item${n.read ? "" : " unread"}`}
                    onClick={() => openItem(n)}
                  >
                    <span className="notif-icon" aria-hidden>
                      {ICONS[n.type] ?? "•"}
                    </span>
                    <span className="notif-body">
                      <span className="notif-msg">{n.message}</span>
                      <span className="notif-sub">
                        {n.songTitle} · {timeAgo(n.createdAt)}
                      </span>
                    </span>
                    {!n.read && <span className="notif-dot" aria-hidden />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
