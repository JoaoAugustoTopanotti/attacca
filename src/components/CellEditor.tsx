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
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // Cache-busts the assembled player so it re-renders after each saved edit.
  const [playerVersion, setPlayerVersion] = useState(0);

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

  async function save() {
    if (!data) return;
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/cells/${data.cell.id}/contributions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alphaTex: fragment, authorName: author }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Falha ao salvar.");
      setInfo("Nova contribuição salva (a anterior virou histórico).");
      setPlayerVersion((v) => v + 1);
      await loadCell(); // refresh history
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

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
                    Math.min(
                      measureCount - 1,
                      Math.max(0, Number(e.target.value) - 1),
                    ),
                  )
                }
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="fragment">
              Fragmento alphaTex da célula (todas as vozes; vozes separadas por
              uma linha <code>\voice</code>)
            </label>
            <textarea
              id="fragment"
              rows={8}
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
          <button type="button" onClick={save} disabled={saving || loading || !data}>
            {saving ? "Salvando…" : "Salvar (nova contribuição)"}
          </button>
          {error && <div className="form-error">{error}</div>}
          {info && <div className="form-ok">{info}</div>}
        </div>

        <h2>Resultado (remontado das células)</h2>
        <AlphaTabPlayer
          key={playerVersion}
          alphaTexUrl={`/api/songs/${songId}/assembled?v=${playerVersion}`}
        />
      </section>

      <aside>
        <h2>Histórico da célula</h2>
        {!data || data.cell.contributions.length === 0 ? (
          <p className="muted">—</p>
        ) : (
          <ul className="revision-list">
            {data.cell.contributions.map((c) => (
              <li
                key={c.id}
                className={`revision-item${c.id === data.cell.acceptedContributionId ? " active" : ""}`}
              >
                <div>
                  <div>
                    <strong>{c.authorName}</strong>
                    <span className="badge">{c.status}</span>
                    {c.id === data.cell.acceptedContributionId && (
                      <span className="badge">aceita</span>
                    )}
                  </div>
                  <div className="revision-meta">{fmt(c.createdAt)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="muted">
          Cada edição é uma linha nova (append-only). O ponteiro de “aceita” só
          muda de alvo; nada é sobrescrito.
        </p>
      </aside>
    </div>
  );
}
