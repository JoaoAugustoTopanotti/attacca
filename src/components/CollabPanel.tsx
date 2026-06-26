"use client";

import Link from "next/link";
import UploadForm from "@/components/UploadForm";
import RevisionList from "@/components/RevisionList";
import type { RevisionDTO } from "@/lib/song-types";

export default function CollabPanel({
  songId,
  revisions,
  view,
  setView,
  refreshRevisions,
  revertTo,
}: {
  songId: string;
  revisions: RevisionDTO[];
  materialized: boolean;
  view: string;
  setView: (v: string) => void;
  refreshRevisions: (selectId?: string) => Promise<void>;
  revertTo: (sourceId: string) => Promise<void>;
}) {
  return (
    <div className="collab-panel collab-panel--scroll">
      <section className="collab-section">
        <div className="collab-section-head">
          <h3>Enviar revisão</h3>
        </div>
        <p className="sub" style={{ marginBottom: 14 }}>
          Envie um arquivo Guitar Pro (.gp / .gp5 / .gpx) para adicionar ou
          atualizar a transcrição.
        </p>
        <UploadForm songId={songId} onUploaded={(id) => refreshRevisions(id)} />
      </section>

      <section className="collab-section">
        <div className="collab-section-head">
          <h3>Histórico</h3>
          <span className="sub">
            {revisions.length}{" "}
            {revisions.length === 1 ? "revisão" : "revisões"}
          </span>
        </div>
        <div className="card" style={{ marginTop: 10 }}>
          <RevisionList
            revisions={revisions}
            selectedId={view === "live" ? null : view}
            onSelect={setView}
            onRevert={revertTo}
          />
        </div>
      </section>

      <section className="collab-section">
        <div className="collab-section-head">
          <h3>Ferramentas</h3>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
          <Link href={`/songs/${songId}/edit`} className="btn-tool">
            Editar por faixa →
          </Link>
          <Link href={`/songs/${songId}/compare`} className="btn-tool">
            Comparar versões →
          </Link>
        </div>
      </section>
    </div>
  );
}
