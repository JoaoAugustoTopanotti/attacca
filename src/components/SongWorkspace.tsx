"use client";

import { useEffect, useState } from "react";
import AlphaTabPlayer from "@/components/AlphaTabPlayer";
import UploadForm from "@/components/UploadForm";
import RevisionList from "@/components/RevisionList";

export type RevisionDTO = {
  id: string;
  number: number;
  authorName: string;
  message: string | null;
  source: string;
  format: string;
  originalName: string | null;
  createdAt: string;
};

export default function SongWorkspace({
  songId,
  initialRevisions,
}: {
  songId: string;
  initialRevisions: RevisionDTO[];
}) {
  const [revisions, setRevisions] = useState<RevisionDTO[]>(initialRevisions);
  const [materialized, setMaterialized] = useState(false);
  const [checked, setChecked] = useState(false);
  // "live" = the document assembled from the cell grid (the collaborative truth).
  // Otherwise a revision id = an old snapshot.
  const [view, setView] = useState<string>(initialRevisions[0]?.id ?? "live");

  // Once a song is materialized, the live grid (guitar + bass + …) is the truth —
  // the player should reflect that, not the original uploaded snapshot.
  useEffect(() => {
    fetch(`/api/songs/${songId}/completeness`)
      .then((r) => r.json())
      .then((c) => {
        const isMat = (c?.tracks?.length ?? 0) > 0;
        setMaterialized(isMat);
        if (isMat) setView("live");
      })
      .catch(() => {})
      .finally(() => setChecked(true));
  }, [songId]);

  const selectedRev = revisions.find((r) => r.id === view) ?? null;

  async function refreshRevisions(selectId?: string) {
    const res = await fetch(`/api/songs/${songId}/revisions`);
    if (!res.ok) return;
    const data: RevisionDTO[] = await res.json();
    setRevisions(data);
    if (selectId && !materialized) setView(selectId);
  }

  async function revertTo(sourceId: string) {
    const res = await fetch(`/api/revisions/${sourceId}/revert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (res.ok) {
      await refreshRevisions(data.id);
    } else {
      alert(data?.error ?? "Falha ao reverter.");
    }
  }

  return (
    <div className="song-layout">
      <section>
        {!checked ? null : view === "live" && materialized ? (
          <AlphaTabPlayer key="live" alphaTexUrl={`/api/songs/${songId}/assembled`} />
        ) : selectedRev ? (
          <AlphaTabPlayer
            key={selectedRev.id}
            revision={{
              id: selectedRev.id,
              format: selectedRev.format,
              source: selectedRev.source,
            }}
          />
        ) : (
          <div
            className="player-card"
            style={{
              minHeight: 200,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <p className="sub">
              Nenhuma revisão ainda. Envie um arquivo ao lado para começar.
            </p>
          </div>
        )}

        {materialized && (
          <p className="sub" style={{ marginTop: 8 }}>
            Tocando:{" "}
            {view === "live" ? (
              <strong>versão ao vivo (do grid de células)</strong>
            ) : (
              <>
                snapshot #{selectedRev?.number}{" "}
                <button
                  type="button"
                  className="secondary"
                  style={{ padding: "2px 8px", fontSize: "0.75rem" }}
                  onClick={() => setView("live")}
                >
                  voltar ao vivo
                </button>
              </>
            )}
          </p>
        )}
      </section>

      <aside className="sidebar">
        <div className="card">
          <div className="card-header">Enviar revisão</div>
          <div className="card-body">
            <UploadForm
              songId={songId}
              onUploaded={(newId) => refreshRevisions(newId)}
            />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            Histórico
            <span style={{ fontWeight: 400, fontSize: "0.78rem" }}>
              {revisions.length}{" "}
              {revisions.length === 1 ? "revisão" : "revisões"}
            </span>
          </div>
          <RevisionList
            revisions={revisions}
            selectedId={view === "live" ? null : view}
            onSelect={setView}
            onRevert={revertTo}
          />
        </div>
      </aside>
    </div>
  );
}
