"use client";

import { Fragment, useState } from "react";
import AlphaTabPlayer from "@/components/AlphaTabPlayer";
import type { RevisionDTO } from "@/lib/song-types";

function formatDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(
    d.getMinutes()
  )}`;
}

export default function HistoryPanel({
  revisions,
  revertTo,
}: {
  revisions: RevisionDTO[];
  revertTo: (id: string) => Promise<void>;
}) {
  const [previewId, setPreviewId] = useState<string | null>(null);

  if (revisions.length === 0) {
    return (
      <div className="hist-panel hist-panel--scroll">
        <p className="sub">Nenhuma versão ainda.</p>
      </div>
    );
  }

  const latestNum = Math.max(...revisions.map((r) => r.number));

  function togglePreview(id: string) {
    setPreviewId((prev) => (prev === id ? null : id));
  }

  function handleRevert(r: RevisionDTO) {
    if (
      window.confirm(
        `Reverter para a revisão #${r.number}? Isso cria uma NOVA revisão a partir dela (o histórico é preservado).`
      )
    ) {
      revertTo(r.id);
    }
  }

  const previewRev = revisions.find((r) => r.id === previewId) ?? null;

  return (
    <div className="hist-panel hist-panel--scroll">
      <p className="hist-intro">
        Versões da transcrição em ordem cronológica. Clique em{" "}
        <strong>Ver</strong> para ouvir e ver a tablatura de qualquer versão.
      </p>

      <ul className="rev-timeline">
        {revisions.map((r) => {
          const isCurrent = r.number === latestNum;
          const isPreviewing = previewId === r.id;

          return (
            <Fragment key={r.id}>
              <li className={`rev-item${isPreviewing ? " rev-item--open" : ""}`}>
                <div className={`rev-dot${isCurrent ? " current" : ""}`} />
                <div className="rev-body">
                  <div className="rev-head">
                    <span className="rev-num">#{r.number}</span>
                    {isCurrent && (
                      <span className="tag tag-current">atual</span>
                    )}
                    <span className="tag tag-fmt">
                      {r.kind === "snapshot" ? "mudança" : r.format}
                    </span>
                  </div>
                  <div className="rev-meta">
                    {r.authorName} · {formatDate(r.createdAt)}
                  </div>
                  {r.message && (
                    <div className="rev-msg">&ldquo;{r.message}&rdquo;</div>
                  )}
                </div>
                <div className="rev-actions">
                  {isCurrent ? (
                    <span className="rev-btn-playing">Tocando</span>
                  ) : (
                    <button
                      type="button"
                      className={`rev-btn${isPreviewing ? " active" : ""}`}
                      onClick={() => togglePreview(r.id)}
                    >
                      {isPreviewing ? "Ver ▴" : "Ver"}
                    </button>
                  )}
                  {!isCurrent && r.kind !== "snapshot" && (
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

              {isPreviewing && previewRev && (
                <li className="rev-preview-li">
                  <div className="rev-preview-header">
                    <span>
                      Revisão #{r.number} — {r.authorName},{" "}
                      {formatDate(r.createdAt)}
                    </span>
                    <button
                      type="button"
                      className="rev-preview-close"
                      onClick={() => setPreviewId(null)}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="rev-preview-player">
                    <AlphaTabPlayer
                      key={previewRev.id}
                      revision={{
                        id: previewRev.id,
                        format: previewRev.format,
                        source: previewRev.source,
                      }}
                    />
                  </div>
                </li>
              )}
            </Fragment>
          );
        })}
      </ul>
    </div>
  );
}
