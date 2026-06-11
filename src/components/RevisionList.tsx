"use client";

import type { RevisionDTO } from "@/components/SongWorkspace";

// Deterministic dd/MM/yyyy HH:mm so server-rendered and client-hydrated markup
// match (toLocaleString differs between Node's ICU and the browser's).
function formatDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function RevisionList({
  revisions,
  selectedId,
  onSelect,
}: {
  revisions: RevisionDTO[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (revisions.length === 0) {
    return <p className="muted">Nenhuma revisão ainda.</p>;
  }

  return (
    <ul className="revision-list">
      {revisions.map((r) => (
        <li
          key={r.id}
          className={`revision-item${r.id === selectedId ? " active" : ""}`}
        >
          <div>
            <div>
              <strong>#{r.number}</strong>
              <span className="badge">{r.format}</span>
            </div>
            <div className="revision-meta">
              {r.authorName} · {formatDate(r.createdAt)}
            </div>
            {r.message && <div className="revision-meta">“{r.message}”</div>}
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() => onSelect(r.id)}
            disabled={r.id === selectedId}
          >
            {r.id === selectedId ? "Vendo" : "Ver"}
          </button>
        </li>
      ))}
    </ul>
  );
}
