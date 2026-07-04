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

  if (!checked) return <div style={{ flex: 1 }} />;

  const isEmpty = !materialized && !selectedRev;

  return (
    <div className="player-panel">
      {isEmpty ? (
        <div className="player-empty">
          <p>Nenhuma versão ainda.</p>
          <p className="sub">
            Vá em <strong>Colaborar</strong> para enviar um arquivo Guitar Pro.
          </p>
        </div>
      ) : view === "live" && materialized ? (
        <AlphaTabPlayer
          key="live"
          alphaTexUrl={`/api/songs/${songId}/assembled`}
          fullpage
        />
      ) : selectedRev ? (
        <AlphaTabPlayer
          key={selectedRev.id}
          revision={{
            id: selectedRev.id,
            format: selectedRev.format,
            source: selectedRev.source,
          }}
          fullpage
        />
      ) : null}

      {materialized && view !== "live" && selectedRev && (
        <div className="player-snapshot-bar">
          <span>
            Tocando a versão <strong>#{selectedRev.number}</strong> do histórico
            {selectedRev.message ? ` — “${selectedRev.message}”` : ""}
          </span>
          <button
            type="button"
            className="player-snapshot-back"
            onClick={() => setView("live")}
          >
            ← Voltar ao atual
          </button>
        </div>
      )}
    </div>
  );
}
