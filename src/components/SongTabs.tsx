"use client";

import { useEffect, useState } from "react";
import PlayerPanel from "@/components/PlayerPanel";
import CollabPanel from "@/components/CollabPanel";
import HistoryPanel from "@/components/HistoryPanel";
import ContribPanel from "@/components/ContribPanel";
import type { RevisionDTO } from "@/lib/song-types";

type Tab = "player" | "colaborar" | "historico" | "contribuidores";

export default function SongTabs({
  songId,
  initialRevisions,
}: {
  songId: string;
  initialRevisions: RevisionDTO[];
}) {
  const [active, setActive] = useState<Tab>("player");
  const [revisions, setRevisions] = useState<RevisionDTO[]>(initialRevisions);
  const [materialized, setMaterialized] = useState(false);
  const [checked, setChecked] = useState(false);
  const [view, setView] = useState<string>(initialRevisions[0]?.id ?? "live");

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

  useEffect(() => {
    fetch(`/api/songs/${songId}/revisions`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setRevisions(data))
      .catch(() => {});
  }, [songId]);

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
    if (res.ok) await refreshRevisions(data.id);
    else alert(data?.error ?? "Falha ao reverter.");
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "player", label: "Player" },
    { id: "colaborar", label: "Colaborar" },
    { id: "historico", label: "Histórico" },
    { id: "contribuidores", label: "Contribuidores" },
  ];

  return (
    <div className="song-tabs-shell">
      <nav className="song-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab${active === t.id ? " active" : ""}`}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* tab content area — fills the rest of the shell */}
      <div className="song-tab-content">
        {active === "player" && (
          <PlayerPanel
            songId={songId}
            revisions={revisions}
            materialized={materialized}
            checked={checked}
            view={view}
            setView={setView}
          />
        )}
        {active === "colaborar" && (
          <CollabPanel
            songId={songId}
            refreshRevisions={refreshRevisions}
          />
        )}
        {active === "historico" && (
          <HistoryPanel revisions={revisions} revertTo={revertTo} />
        )}
        {active === "contribuidores" && <ContribPanel songId={songId} />}
      </div>
    </div>
  );
}
