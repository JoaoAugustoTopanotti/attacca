"use client";

import { useState } from "react";
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
  const [selectedId, setSelectedId] = useState<string | null>(
    initialRevisions[0]?.id ?? null,
  );

  const selected = revisions.find((r) => r.id === selectedId) ?? null;

  async function refreshRevisions(selectId?: string) {
    const res = await fetch(`/api/songs/${songId}/revisions`);
    if (!res.ok) return;
    const data: RevisionDTO[] = await res.json();
    setRevisions(data);
    if (selectId) {
      setSelectedId(selectId);
    } else if (data.length > 0 && !data.some((r) => r.id === selectedId)) {
      setSelectedId(data[0].id);
    }
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
        {selected ? (
          <AlphaTabPlayer
            key={selected.id}
            revision={{
              id: selected.id,
              format: selected.format,
              source: selected.source,
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
            selectedId={selectedId}
            onSelect={setSelectedId}
            onRevert={revertTo}
          />
        </div>
      </aside>
    </div>
  );
}
