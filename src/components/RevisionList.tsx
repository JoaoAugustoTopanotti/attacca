"use client";

import type { RevisionDTO } from "@/components/SongWorkspace";

// Deterministic dd/MM HH:mm so server-rendered and client-hydrated markup match.
function formatDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
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
    return <p className="sub" style={{ padding: "12px 14px" }}>Nenhuma revisão ainda.</p>;
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
    <ul className="rev-timeline">
      {revisions.map((r) => {
        const isCurrent = r.number === currentNumber;
        const isSelected = r.id === selectedId;
        return (
          <li key={r.id} className="rev-item">
            <div className={`rev-dot${isCurrent ? " current" : ""}`} />
            <div className="rev-body">
              <div className="rev-head">
                <span className="rev-num">#{r.number}</span>
                {isCurrent && <span className="tag tag-current">atual</span>}
                <span className="tag tag-fmt">{r.format}</span>
              </div>
              <div className="rev-meta">
                {r.authorName} · {formatDate(r.createdAt)}
              </div>
              {r.message && (
                <div className="rev-msg">&ldquo;{r.message}&rdquo;</div>
              )}
            </div>
            <div className="rev-actions">
              <button
                type="button"
                className={`rev-btn${isSelected ? " active" : ""}`}
                onClick={() => onSelect(r.id)}
                disabled={isSelected}
              >
                {isSelected ? "Vendo" : "Ver"}
              </button>
              {!isCurrent && (
                <button
                  type="button"
                  className="rev-btn"
                  onClick={() => handleRevert(r)}
                  title={`Reverter para #${r.number}`}
                >
                  ⟲
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
