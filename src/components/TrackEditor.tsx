"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AlphaTabPlayer, { type AlphaTabPlayerHandle } from "@/components/AlphaTabPlayer";
import TabEditor from "@/components/TabEditor";

type Me = { id: string; displayName: string } | null;
type Content = {
  track: { id: string; order: number; name: string };
  measureCount: number;
  alphaTex: string;
  song: { ownerId: string | null; ownerName: string | null };
};
type Proposal = {
  trackOrder: number;
  trackName: string;
  authorId: string | null;
  authorName: string;
  count: number;
};

export default function TrackEditor({
  songId,
  tracks,
}: {
  songId: string;
  tracks: { order: number; name: string }[];
}) {
  const [me, setMe] = useState<Me>(null);
  const [trackOrder, setTrackOrder] = useState(tracks[0]?.order ?? 0);
  const [content, setContent] = useState<Content | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // Altura do painel inferior (redimensionável por drag)
  const [bottomHeight, setBottomHeight] = useState(220);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [reviewing, setReviewing] = useState<Proposal | null>(null);
  const [reviewContent, setReviewContent] = useState<
    { proposedAlphaTex: string; currentAlphaTex: string } | null
  >(null);

  // Player external-control state
  const playerRef = useRef<AlphaTabPlayerHandle>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);

  // Resize handle: arrastar a borda superior do painel inferior
  function handleResizeStart(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = bottomHeight;

    function onMove(ev: MouseEvent) {
      // Arrastar para cima (delta negativo) → painel maior
      const delta = startY - ev.clientY;
      setBottomHeight(Math.max(120, Math.min(600, startH + delta)));
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then(setMe)
      .catch(() => {});
  }, []);

  const ownerId = content?.song.ownerId ?? null;
  const ownerName = content?.song.ownerName ?? null;
  const isOwner = !!me && (!ownerId || ownerId === me.id);
  const visibleProposals = isOwner
    ? proposals
    : proposals.filter((p) => p.authorId && p.authorId === me?.id);

  const loadTrack = useCallback(async () => {
    setError(null);
    setInfo(null);
    const res = await fetch(`/api/songs/${songId}/tracks/${trackOrder}/content`);
    if (!res.ok) return;
    const json: Content = await res.json();
    setContent(json);
    setText(json.alphaTex);
  }, [songId, trackOrder]);

  const loadProposals = useCallback(async () => {
    const res = await fetch(`/api/songs/${songId}/proposals`);
    if (res.ok) setProposals(await res.json());
  }, [songId]);

  useEffect(() => { loadTrack(); }, [loadTrack]);
  useEffect(() => { loadProposals(); }, [loadProposals]);

  // Sincroniza o player com a trilha sendo editada.
  // Quando playerReady muda para true (score carregado) OU quando trackOrder muda,
  // pede ao player para exibir a trilha correspondente.
  useEffect(() => {
    if (!playerReady) return;
    const trackIndex = tracks.findIndex((t) => t.order === trackOrder);
    if (trackIndex >= 0) playerRef.current?.selectTrack(trackIndex);
  }, [trackOrder, playerReady, tracks]);

  // Reset player state when switching tracks or proposals
  const playerUrl = reviewing
    ? `/api/songs/${songId}/assembled?track=${reviewing.trackOrder}&author=${reviewing.authorId}`
    : `/api/songs/${songId}/assembled`;

  useEffect(() => {
    setIsPlaying(false);
    setPlayerReady(false);
  }, [playerUrl]);

  async function submit() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/songs/${songId}/tracks/${trackOrder}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alphaTex: text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Falha.");
      setInfo(
        json.accepted
          ? `Salvo — ${json.changed} compasso(s) atualizado(s).`
          : `Proposta enviada — ${json.changed} compasso(s). Aguardando revisão.`,
      );
      await loadTrack();
      await loadProposals();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setBusy(false);
    }
  }

  async function startReview(p: Proposal) {
    setReviewing(p);
    setReviewContent(null);
    setInfo(null);
    setError(null);
    const res = await fetch(
      `/api/songs/${songId}/tracks/${p.trackOrder}/proposal?author=${p.authorId}`,
    );
    if (res.ok) setReviewContent(await res.json());
  }

  async function doReview(p: Proposal, action: "accept" | "reject") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/songs/${songId}/tracks/${p.trackOrder}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorId: p.authorId, action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Falha.");
      setInfo(action === "accept" ? "Proposta aceita." : "Proposta recusada.");
      setReviewing(null);
      setReviewContent(null);
      await loadTrack();
      await loadProposals();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="edit-main">
      {/* ── Controls bar ── */}
      <div className="edit-controls">
        <button
          type="button"
          className="playpause-btn"
          onClick={() => playerRef.current?.playPause()}
          disabled={!playerReady}
          title={isPlaying ? "Pausar" : "Tocar"}
        >
          {isPlaying ? "⏸" : "▶"}
        </button>

        <div className="track-select-wrap">
          <select
            className="track-select"
            value={trackOrder}
            onChange={(e) => {
              setTrackOrder(Number(e.target.value));
              setReviewing(null);
              setReviewContent(null);
            }}
            aria-label="Faixa a editar"
          >
            {tracks.map((t) => (
              <option key={t.order} value={t.order}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {ownerName && (
          <span className={`edit-role-badge${isOwner ? " owner" : ""}`}>
            {isOwner ? "dono — salva direto" : `proposta · revisada por ${ownerName}`}
          </span>
        )}
        {!me && (
          <span className="edit-role-badge">identifique-se para editar</span>
        )}

        {reviewing && (
          <span className="edit-preview-badge">
            pré-visualizando proposta de {reviewing.authorName}
          </span>
        )}

        <div style={{ flex: 1 }} />

        <button
          type="button"
          className="btn-edit-save"
          onClick={submit}
          disabled={busy || !content || !me}
        >
          {isOwner ? "Salvar a trilha" : "Propor a trilha"}
        </button>
      </div>

      {/* ── Full-width player ── */}
      <div className="edit-player">
        <AlphaTabPlayer
          ref={playerRef}
          key={playerUrl}
          alphaTexUrl={playerUrl}
          editMode
          onPlayingChange={setIsPlaying}
          onPlayerReadyChange={setPlayerReady}
        />
      </div>

      {/* ── Resize handle ── */}
      <div
        className="edit-resize-handle"
        onMouseDown={handleResizeStart}
        title="Arrastar para redimensionar"
      />

      {/* ── Bottom panel: editor + proposals ── */}
      <div className="edit-bottom" style={{ height: bottomHeight }}>
        {/* Left — visual tab editor (substitui o textarea) */}
        {content ? (
          <TabEditor
            key={trackOrder}
            alphaTex={text}
            onChange={setText}
            disabled={!me}
            trackStringCount={/baixo/i.test(content.track.name) ? 4 : 6}
            error={error}
            info={info}
          />
        ) : (
          <div className="edit-editor">
            <div className="player-loading" style={{ flex: 1 }}>Carregando…</div>
          </div>
        )}

        {/* Right — proposals */}
        <div className="edit-proposals">
          <div className="proposals-head">
            {isOwner ? "Propostas a revisar" : "Suas propostas"}
          </div>

          {visibleProposals.length === 0 ? (
            <p className="proposals-empty">
              {isOwner
                ? "Nenhuma proposta pendente."
                : "Você ainda não propôs mudanças."}
            </p>
          ) : (
            <ul className="proposals-list">
              {visibleProposals.map((p) => {
                const active =
                  reviewing?.trackOrder === p.trackOrder &&
                  reviewing?.authorId === p.authorId;
                return (
                  <li key={`${p.trackOrder}-${p.authorId}`} className="proposal-item">
                    <div className="proposal-meta">
                      <div className="proposal-who">{p.authorName}</div>
                      <div className="proposal-track">
                        {p.trackName} · {p.count} compasso(s)
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`btn-review${active ? " active" : ""}`}
                      onClick={() => (active ? setReviewing(null) : startReview(p))}
                    >
                      {active ? "Fechar" : isOwner ? "Revisar" : "Ver"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Accept / reject when reviewing */}
          {reviewing && isOwner && (
            <div className="review-actions">
              <button
                type="button"
                className="btn-accept"
                onClick={() => doReview(reviewing, "accept")}
                disabled={busy}
              >
                Aceitar
              </button>
              <button
                type="button"
                className="btn-reject"
                onClick={() => doReview(reviewing, "reject")}
                disabled={busy}
              >
                Recusar
              </button>
            </div>
          )}

          {reviewing && !isOwner && (
            <p className="proposals-empty" style={{ marginTop: 8 }}>
              Aguardando {ownerName ?? "o dono"} aceitar.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
