"use client";

import { useEffect, useState } from "react";
import PlayerPanel from "@/components/PlayerPanel";
import CollabPanel from "@/components/CollabPanel";
import ProposalsPanel from "@/components/ProposalsPanel";
import HistoryPanel from "@/components/HistoryPanel";
import ContribPanel from "@/components/ContribPanel";
import type { RevisionDTO } from "@/lib/song-types";

type Tab = "player" | "colaborar" | "propostas" | "historico" | "contribuidores";

export default function SongTabs({
  songId,
  ownerId,
  initialRevisions,
}: {
  songId: string;
  ownerId: string | null;
  initialRevisions: RevisionDTO[];
}) {
  const [active, setActive] = useState<Tab>("player");
  const [revisions, setRevisions] = useState<RevisionDTO[]>(initialRevisions);
  const [materialized, setMaterialized] = useState(false);
  const [checked, setChecked] = useState(false);
  const [view, setView] = useState<string>(initialRevisions[0]?.id ?? "live");
  const [meId, setMeId] = useState<string | null>(null);

  // Dono = criador (ADR 0003); música sem dono (ownerId null) é aberta → todos
  // veem o Histórico. O Histórico é do dono: é dele o poder de reverter.
  const isOwner = !ownerId || (!!meId && ownerId === meId);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((m) => setMeId(m?.id ?? null))
      .catch(() => {});
  }, []);

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

  // Histórico → player principal: seleciona a versão e leva o usuário ao Player.
  function viewInPlayer(revId: string) {
    setView(revId);
    setActive("player");
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "player", label: "Player" },
    { id: "colaborar", label: "Colaborar" },
    { id: "propostas", label: "Propostas" },
    // Histórico é visível a todos (é o revezamento acontecendo); só o Reverter
    // é do dono — gate dentro do HistoryPanel.
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
            materialized={materialized}
            onScaffolded={() => setMaterialized(true)}
          />
        )}
        {active === "propostas" && (
          <ProposalsPanel
            songId={songId}
            refreshRevisions={() => refreshRevisions()}
          />
        )}
        {active === "historico" && (
          <HistoryPanel
            revisions={revisions}
            revertTo={revertTo}
            canRevert={isOwner}
            view={view}
            onView={viewInPlayer}
          />
        )}
        {active === "contribuidores" && <ContribPanel songId={songId} />}
      </div>
    </div>
  );
}
