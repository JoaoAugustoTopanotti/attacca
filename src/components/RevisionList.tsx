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
  onRevert,
}: {
  revisions: RevisionDTO[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRevert: (id: string) => void;
}) {
  if (revisions.length === 0) {
    return <p className="muted">Nenhuma revisão ainda.</p>;
  }

  // The current revision is the highest number; reverting to it is a no-op.
  const currentNumber = Math.max(...revisions.map((r) => r.number));

  function handleRevert(r: RevisionDTO) {
    if (
      window.confirm(
        `Reverter para a revisão #${r.number}? Isso cria uma NOVA revisão a partir dela (o histórico é preservado).`,
      )
    ) {
      onRevert(r.id);
    }
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
          <div className="revision-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => onSelect(r.id)}
              disabled={r.id === selectedId}
            >
              {r.id === selectedId ? "Vendo" : "Ver"}
            </button>
            {r.number !== currentNumber && (
              <button
                type="button"
                className="secondary"
                onClick={() => handleRevert(r)}
              >
                Reverter
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
