"use client";

import { useCallback, useEffect, useState } from "react";
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
  // Propostas pendentes visíveis para mim; alimenta o badge da aba Propostas.
  const [pendingProposals, setPendingProposals] = useState<
    { authorId: string | null }[]
  >([]);

  // O dono é o criador; música sem dono é aberta a qualquer pessoa
  // identificada. Anônimo nunca conta como dono, senão o badge de propostas
  // apareceria até deslogado numa música aberta.
  const isOwner = !!meId && (!ownerId || ownerId === meId);

  // Contagem exibida na aba: o dono vê todas, o colaborador só as suas.
  const pendingCount = isOwner
    ? pendingProposals.length
    : pendingProposals.filter((p) => p.authorId && p.authorId === meId).length;

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((m) => setMeId(m?.id ?? null))
      .catch(() => {});
  }, []);

  // Abre a aba indicada pelo hash da URL, para uma notificação levar direto ao
  // lugar certo (#propostas, #colaborar), e acompanha mudanças posteriores.
  useEffect(() => {
    const TAB_IDS: Tab[] = [
      "player",
      "colaborar",
      "propostas",
      "historico",
      "contribuidores",
    ];
    const apply = () => {
      const h = window.location.hash.replace(/^#/, "") as Tab;
      if (TAB_IDS.includes(h)) setActive(h);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
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

  const refreshProposals = useCallback(async () => {
    try {
      const res = await fetch(`/api/songs/${songId}/proposals`);
      if (!res.ok) return;
      const data = await res.json();
      setPendingProposals(data?.proposals ?? []);
    } catch {
      /* best-effort: o badge é apenas informativo */
    }
  }, [songId]);

  useEffect(() => {
    refreshProposals();
  }, [refreshProposals]);

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

  // Do Histórico para o player: seleciona a versão e leva à aba Player.
  function viewInPlayer(revId: string) {
    setView(revId);
    setActive("player");
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "player", label: "Player" },
    { id: "colaborar", label: "Colaborar" },
    { id: "propostas", label: "Propostas" },
    // O Histórico é visível a todos, porque é o revezamento acontecendo; só o
    // botão Reverter é restrito ao dono, dentro do HistoryPanel.
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
            {t.id === "propostas" && pendingCount > 0 && (
              <span className="tab-badge" aria-label={`${pendingCount} proposta(s) pendente(s)`}>
                {pendingCount > 9 ? "9+" : pendingCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Área de conteúdo da aba: ocupa o restante do shell */}
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
            onReviewed={refreshProposals}
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
