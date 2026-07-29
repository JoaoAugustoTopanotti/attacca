"use client";

import { useCallback, useEffect, useState } from "react";
import AlphaTabPlayer from "@/components/AlphaTabPlayer";

type Contribution = {
  id: string;
  authorName: string;
  status: string;
  message: string | null;
  createdAt: string;
  alphaTex: string;
};
type CellResponse = {
  track: { id: string; order: number; name: string };
  measure: { id: string; order: number };
  cell: {
    id: string;
    acceptedContributionId: string | null;
    contributions: Contribution[];
  };
  // Modelo de maintainer: quem aceita é o dono da música, seu criador.
  song: { id: string; ownerId: string | null; ownerName: string | null };
};

function fmt(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function CellEditor({
  songId,
  tracks,
  measureCount,
}: {
  songId: string;
  tracks: { order: number; name: string }[];
  measureCount: number;
}) {
  const [trackOrder, setTrackOrder] = useState(tracks[0]?.order ?? 0);
  const [measureOrder, setMeasureOrder] = useState(0);
  const [data, setData] = useState<CellResponse | null>(null);
  const [fragment, setFragment] = useState("");
  const [me, setMe] = useState<{ id: string; displayName: string } | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [playerVersion, setPlayerVersion] = useState(0);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then(setMe)
      .catch(() => {});
  }, []);

  const acceptedId = data?.cell.acceptedContributionId ?? null;
  const reviewContrib = data?.cell.contributions.find((c) => c.id === reviewId) ?? null;

  // Só o dono aceita; música sem dono é aberta a qualquer identificado.
  const ownerName = data?.song.ownerName ?? null;
  const ownerId = data?.song.ownerId ?? null;
  const isOwner = !!me && (!ownerId || ownerId === me.id);

  const loadCell = useCallback(async () => {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(
        `/api/songs/${songId}/cell?track=${trackOrder}&measure=${measureOrder}`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Falha ao carregar a célula.");
      setData(json);
      setReviewId(null);
      const accepted = json.cell.contributions.find(
        (c: Contribution) => c.id === json.cell.acceptedContributionId,
      );
      setFragment(accepted?.alphaTex ?? "");
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setLoading(false);
    }
  }, [songId, trackOrder, measureOrder]);

  useEffect(() => {
    loadCell();
  }, [loadCell]);

  async function postJson(url: string, body: unknown) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Falha.");
      return json;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveContribution(accept: boolean) {
    if (!data) return;
    const ok = await postJson(`/api/cells/${data.cell.id}/contributions`, {
      alphaTex: fragment,
      accept,
    });
    if (ok) {
      setInfo(
        accept
          ? "Salvo e aceito (a versão anterior virou histórico)."
          : "Proposta enviada — aguardando o dono aceitar.",
      );
      setPlayerVersion((v) => v + 1);
      await loadCell();
    }
  }

  async function accept(contributionId: string) {
    if (!data) return;
    const ok = await postJson(`/api/cells/${data.cell.id}/accept`, { contributionId });
    if (ok) {
      setInfo("Proposta aceita — virou a versão atual.");
      setPlayerVersion((v) => v + 1);
      await loadCell();
    }
  }

  async function reject(contributionId: string) {
    if (!data) return;
    const ok = await postJson(`/api/cells/${data.cell.id}/reject`, { contributionId });
    if (ok) {
      setInfo("Proposta recusada (fica no histórico).");
      await loadCell();
    }
  }

  // O player mostra o documento aceito ou uma pré-visualização com a
  // contribuição em revisão no lugar, sem aceitá-la.
  const previewing = reviewContrib && reviewContrib.id !== acceptedId;
  const playerUrl = previewing
    ? `/api/songs/${songId}/assembled?cell=${data!.cell.id}&contribution=${reviewContrib!.id}&v=${playerVersion}`
    : `/api/songs/${songId}/assembled?v=${playerVersion}`;

  return (
    <div className="layout-2col">
      <section>
        <div className="panel">
          <div className="row">
            <div className="field">
              <label htmlFor="track">Trilha</label>
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
            <div className="field">
              <label htmlFor="measure">Compasso (1–{measureCount})</label>
              <input
                id="measure"
                type="number"
                min={1}
                max={measureCount}
                value={measureOrder + 1}
                onChange={(e) =>
                  setMeasureOrder(
                    Math.min(measureCount - 1, Math.max(0, Number(e.target.value) - 1)),
                  )
                }
              />
            </div>
          </div>

          {ownerName && (
            <p className="muted" style={{ marginBottom: 10 }}>
              Dono da música: <strong>{ownerName}</strong>
              {isOwner ? " (você)" : " — você pode propor; o dono aceita."}
            </p>
          )}

          {!me && (
            <div className="form-error">
              Identifique-se no topo da página para propor ou editar.
            </div>
          )}

          <div className="field">
            <label htmlFor="fragment">
              Fragmento alphaTex (todas as vozes; separadas por uma linha{" "}
              <code>\voice</code>)
            </label>
            <textarea
              id="fragment"
              rows={7}
              value={fragment}
              onChange={(e) => setFragment(e.target.value)}
              disabled={loading || !data}
              spellCheck={false}
              style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.85rem" }}
            />
          </div>

          <div className="player-toolbar">
            {isOwner ? (
              <button
                type="button"
                onClick={() => saveContribution(true)}
                disabled={busy || loading || !data}
              >
                Salvar (aceito direto)
              </button>
            ) : (
              <button
                type="button"
                onClick={() => saveContribution(false)}
                disabled={busy || loading || !data || !me}
              >
                Propor mudança
              </button>
            )}
          </div>
          {data && !isOwner && me && (
            <div className="muted">
              Você não é o dono — sua mudança vai como <strong>proposta</strong>
              {ownerName ? ` para ${ownerName} aceitar.` : "."}
            </div>
          )}
          {error && <div className="form-error">{error}</div>}
          {info && <div className="form-ok">{info}</div>}
        </div>

        <h2>
          {previewing ? "Pré-visualização (proposta)" : "Remontado das células"}
        </h2>
        <AlphaTabPlayer key={playerUrl} alphaTexUrl={playerUrl} />
      </section>

      <aside>
        <h2>Histórico / propostas</h2>
        {!data || data.cell.contributions.length === 0 ? (
          <p className="muted">—</p>
        ) : (
          <ul className="revision-list">
            {data.cell.contributions.map((c) => (
              <li
                key={c.id}
                className={`revision-item${c.id === reviewId ? " active" : ""}`}
              >
                <div>
                  <div>
                    <strong>{c.authorName}</strong>
                    <span className="badge">{c.status}</span>
                    {c.id === acceptedId && <span className="badge">atual</span>}
                  </div>
                  <div className="revision-meta">{fmt(c.createdAt)}</div>
                </div>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setReviewId(c.id === reviewId ? null : c.id)}
                >
                  {c.id === reviewId ? "Fechar" : "Revisar"}
                </button>
              </li>
            ))}
          </ul>
        )}

        {reviewContrib && (
          <div className="panel" style={{ marginTop: 10 }}>
            <div className="muted">
              Contribuição de <strong>{reviewContrib.authorName}</strong>{" "}
              ({reviewContrib.status})
              {reviewContrib.id === acceptedId ? " — versão atual" : ""}
            </div>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                fontSize: "0.78rem",
                background: "var(--panel-2)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: 8,
                marginTop: 8,
                maxHeight: 180,
                overflow: "auto",
              }}
            >
              {reviewContrib.alphaTex}
            </pre>
            {reviewContrib.id !== acceptedId && isOwner && (
              <div className="player-toolbar">
                <button type="button" onClick={() => accept(reviewContrib.id)} disabled={busy}>
                  Aceitar esta
                </button>
                <button type="button" className="secondary" onClick={() => reject(reviewContrib.id)} disabled={busy}>
                  Recusar
                </button>
              </div>
            )}
            {reviewContrib.id !== acceptedId && !isOwner && (
              <div className="muted" style={{ marginTop: 6 }}>
                Só {ownerName ?? "o dono"} aceita ou recusa.
              </div>
            )}
          </div>
        )}

        <p className="muted" style={{ marginTop: 10 }}>
          Append-only: cada edição/proposta é uma linha nova; aceitar só move o
          ponteiro da “atual”. O dono da música é quem aceita; qualquer um propõe.
        </p>
      </aside>
    </div>
  );
}
