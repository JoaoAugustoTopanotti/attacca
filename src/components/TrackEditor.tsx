"use client";

import { useCallback, useEffect, useState } from "react";
import AlphaTabPlayer from "@/components/AlphaTabPlayer";

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
  const [playerVersion, setPlayerVersion] = useState(0);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [reviewing, setReviewing] = useState<Proposal | null>(null);
  const [reviewContent, setReviewContent] = useState<
    { proposedAlphaTex: string; currentAlphaTex: string } | null
  >(null);

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then(setMe).catch(() => {});
  }, []);

  const ownerId = content?.song.ownerId ?? null;
  const ownerName = content?.song.ownerName ?? null;
  const isOwner = !!me && (!ownerId || ownerId === me.id);
  // The owner reviews everyone's proposals; a collaborator sees only their own.
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

  useEffect(() => {
    loadTrack();
  }, [loadTrack]);
  useEffect(() => {
    loadProposals();
  }, [loadProposals]);

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
          : `Proposta enviada — ${json.changed} compasso(s). Veja em "Suas propostas" ao lado; aguardando o dono aceitar.`,
      );
      setPlayerVersion((v) => v + 1);
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

  async function review(p: Proposal, action: "accept" | "reject") {
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
      setPlayerVersion((v) => v + 1);
      await loadTrack();
      await loadProposals();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setBusy(false);
    }
  }

  // Player previews the proposal under review, else the live document.
  const playerUrl = reviewing
    ? `/api/songs/${songId}/assembled?track=${reviewing.trackOrder}&author=${reviewing.authorId}&v=${playerVersion}`
    : `/api/songs/${songId}/assembled?v=${playerVersion}`;

  return (
    <div className="layout-2col">
      <section>
        <div className="panel">
          <div className="field">
            <label htmlFor="track">Trilha (instrumento)</label>
            <select
              id="track"
              value={trackOrder}
              onChange={(e) => setTrackOrder(Number(e.target.value))}
            >
              {tracks.map((t) => (
                <option key={t.order} value={t.order}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {ownerName && (
            <p className="muted">
              Dono da música: <strong>{ownerName}</strong>
              {isOwner ? " (você — você salva direto)" : " — você propõe; o dono aceita."}
            </p>
          )}
          {!me && (
            <div className="form-error">
              Identifique-se no topo da página para editar.
            </div>
          )}

          <div className="field">
            <label htmlFor="tracktab">
              Tablatura da trilha inteira ({content?.measureCount ?? "—"} compassos,
              um por bloco, separados por <code>|</code>)
            </label>
            <textarea
              id="tracktab"
              rows={12}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={!content}
              spellCheck={false}
              style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.85rem" }}
            />
          </div>

          <button type="button" onClick={submit} disabled={busy || !content || !me}>
            {isOwner ? "Salvar a trilha" : "Propor a trilha"}
          </button>
          {error && <div className="form-error">{error}</div>}
          {info && <div className="form-ok">{info}</div>}
        </div>

        <h2>
          {reviewing
            ? reviewing.authorId === me?.id
              ? "Pré-visualização: sua proposta"
              : `Pré-visualização: proposta de ${reviewing.authorName}`
            : "Versão ao vivo (do grid)"}
        </h2>
        <AlphaTabPlayer key={playerUrl} alphaTexUrl={playerUrl} />
      </section>

      <aside>
        <h2>{isOwner ? "Propostas a revisar" : "Suas propostas"}</h2>
        {visibleProposals.length === 0 ? (
          <p className="muted">
            {isOwner
              ? "Nenhuma proposta pendente."
              : "Você ainda não propôs mudanças nesta música."}
          </p>
        ) : (
          <ul className="revision-list">
            {visibleProposals.map((p) => {
              const active =
                reviewing?.trackOrder === p.trackOrder &&
                reviewing?.authorId === p.authorId;
              return (
                <li
                  key={`${p.trackOrder}-${p.authorId}`}
                  className={`revision-item${active ? " active" : ""}`}
                >
                  <div>
                    <div>
                      <strong>{p.authorName}</strong> propôs{" "}
                      <strong>{p.trackName}</strong>
                    </div>
                    <div className="revision-meta">{p.count} compasso(s)</div>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => (active ? setReviewing(null) : startReview(p))}
                  >
                    {active ? "Fechar" : isOwner ? "Revisar" : "Ver"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {reviewing && (
          <div className="panel" style={{ marginTop: 10 }}>
            <div className="muted">
              {reviewing.authorId === me?.id ? "Sua proposta" : `Proposta de ${reviewing.authorName}`}{" "}
              para <strong>{reviewing.trackName}</strong> — ouça na pré-visualização
              ao lado e veja o tab abaixo.
            </div>
            <label className="muted" style={{ display: "block", marginTop: 8 }}>
              Tab proposto:
            </label>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                fontSize: "0.78rem",
                background: "var(--panel-2)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: 8,
                marginTop: 4,
                maxHeight: 200,
                overflow: "auto",
              }}
            >
              {reviewContent?.proposedAlphaTex ?? "…"}
            </pre>
            {isOwner ? (
              <div className="player-toolbar">
                <button type="button" onClick={() => review(reviewing, "accept")} disabled={busy}>
                  Aceitar
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => review(reviewing, "reject")}
                  disabled={busy}
                >
                  Recusar
                </button>
              </div>
            ) : (
              <p className="muted" style={{ marginTop: 8 }}>
                Aguardando <strong>{ownerName ?? "o dono"}</strong> aceitar.
              </p>
            )}
          </div>
        )}

        <p className="muted" style={{ marginTop: 10 }}>
          Você edita a trilha inteira de uma vez; por baixo vira contribuição por
          compasso (append-only). O dono salva direto; os outros propõem.
        </p>
      </aside>
    </div>
  );
}
