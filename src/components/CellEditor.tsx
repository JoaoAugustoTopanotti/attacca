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
  const [author, setAuthor] = useState("");
  const [reviewId, setReviewId] = useState<string | null>(null); // history entry under review
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [playerVersion, setPlayerVersion] = useState(0);

  const acceptedId = data?.cell.acceptedContributionId ?? null;
  const reviewContrib = data?.cell.contributions.find((c) => c.id === reviewId) ?? null;

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
      authorName: author,
      accept,
    });
    if (ok) {
      setInfo(
        accept
          ? "Contribuição salva e aceita (anterior virou histórico)."
          : "Proposta registrada (não aceita ainda).",
      );
      setPlayerVersion((v) => v + 1);
      await loadCell();
    }
  }

  async function accept(contributionId: string) {
    if (!data) return;
    const ok = await postJson(`/api/cells/${data.cell.id}/accept`, { contributionId });
    if (ok) {
      setInfo("Proposta aceita — o ponteiro re-apontou para ela.");
      setPlayerVersion((v) => v + 1);
      await loadCell();
    }
  }

  async function reject(contributionId: string) {
    if (!data) return;
    const ok = await postJson(`/api/cells/${data.cell.id}/reject`, { contributionId });
    if (ok) {
      setInfo("Proposta recusada (continua no histórico, marcada como rejeitada).");
      await loadCell();
    }
  }

  // The player shows the accepted document, or a PREVIEW with the reviewed
  // contribution swapped in (without accepting it).
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
          <div className="field">
            <label htmlFor="author">Seu nome</label>
            <input
              id="author"
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="anon"
            />
          </div>
          <div className="player-toolbar">
            <button type="button" onClick={() => saveContribution(true)} disabled={busy || loading || !data}>
              Salvar e aceitar
            </button>
            <button type="button" className="secondary" onClick={() => saveContribution(false)} disabled={busy || loading || !data}>
              Propor (não aceitar)
            </button>
          </div>
          {error && <div className="form-error">{error}</div>}
          {info && <div className="form-ok">{info}</div>}
        </div>

        <h2>
          {previewing ? "Pré-visualização (proposta não aceita)" : "Remontado das células"}
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
                    {c.id === acceptedId && <span className="badge">aceita</span>}
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
              Revisando contribuição de <strong>{reviewContrib.authorName}</strong>{" "}
              ({reviewContrib.status})
              {reviewContrib.id === acceptedId ? " — é a aceita atual" : ""}
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
            {reviewContrib.id !== acceptedId && (
              <div className="player-toolbar">
                <button type="button" onClick={() => accept(reviewContrib.id)} disabled={busy}>
                  Aceitar esta
                </button>
                <button type="button" className="secondary" onClick={() => reject(reviewContrib.id)} disabled={busy}>
                  Recusar
                </button>
              </div>
            )}
          </div>
        )}

        <p className="muted" style={{ marginTop: 10 }}>
          Append-only: cada edição/proposta é uma linha nova; aceitar só move o
          ponteiro. (Por enquanto qualquer um pode aceitar — abertura temporária
          até existir reivindicação de trilha.)
        </p>
      </aside>
    </div>
  );
}
