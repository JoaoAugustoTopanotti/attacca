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

  return (
    <div className="layout-2col">
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
          <div className="panel">
            <p className="muted">
              Nenhuma revisão ainda. Envie um arquivo ao lado para começar.
            </p>
          </div>
        )}
      </section>

      <aside>
        <h2>Enviar revisão</h2>
        <div className="panel">
          <UploadForm
            songId={songId}
            onUploaded={(newId) => refreshRevisions(newId)}
          />
        </div>

        <h2>Histórico</h2>
        <RevisionList
          revisions={revisions}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </aside>
    </div>
  );
}
