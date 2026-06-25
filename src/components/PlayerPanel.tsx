"use client";

import AlphaTabPlayer from "@/components/AlphaTabPlayer";
import type { RevisionDTO } from "@/lib/song-types";

export default function PlayerPanel({
  songId,
  revisions,
  materialized,
  checked,
  view,
  setView,
}: {
  songId: string;
  revisions: RevisionDTO[];
  materialized: boolean;
  checked: boolean;
  view: string;
  setView: (v: string) => void;
}) {
  const selectedRev = revisions.find((r) => r.id === view) ?? null;

  // Don't flash an empty state while the materialization check is in flight.
  if (!checked) return <div style={{ minHeight: 240 }} />;

  const isEmpty = !materialized && !selectedRev;

  return (
    <div className="player-fullpage">
      {isEmpty ? (
        <div className="player-empty">
          <p>Nenhuma versão ainda.</p>
          <p className="sub">
            Vá em <strong>Colaborar</strong> para enviar um arquivo Guitar Pro.
          </p>
        </div>
      ) : view === "live" && materialized ? (
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
      ) : null}

      {materialized && view !== "live" && selectedRev && (
        <div className="player-snapshot-bar">
          Visualizando snapshot #{selectedRev.number}
          <button
            type="button"
            className="ghost"
            style={{ fontSize: "0.78rem", marginLeft: 10 }}
            onClick={() => setView("live")}
          >
            ver versão atual
          </button>
        </div>
      )}
    </div>
  );
}
