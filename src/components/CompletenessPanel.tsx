"use client";

import { useCallback, useEffect, useState } from "react";

type TrackC = {
  id: string;
  name: string;
  ownerName: string | null;
  done: number;
  total: number;
  percent: number;
};
type Completeness = {
  measureCount: number;
  percent: number;
  tracks: TrackC[];
  missing: string[];
};
type Preset = { key: string; label: string };

export default function CompletenessPanel({ songId }: { songId: string }) {
  const [data, setData] = useState<Completeness | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetKey, setPresetKey] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/songs/${songId}/completeness`);
    if (res.ok) setData(await res.json());
  }, [songId]);

  useEffect(() => {
    load();
    fetch(`/api/songs/${songId}/tracks`)
      .then((r) => r.json())
      .then((ps: Preset[]) => {
        setPresets(ps);
        setPresetKey(ps[0]?.key ?? "");
      })
      .catch(() => {});
  }, [load, songId]);

  async function declare() {
    if (!presetKey) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/songs/${songId}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presetKey, name: name.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Falha ao declarar.");
      setName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setBusy(false);
    }
  }

  async function materialize() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/songs/${songId}/materialize`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Falha ao materializar.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return null;

  // Not yet materialized — show a single action.
  if (data.tracks.length === 0) {
    return (
      <div className="panel">
        <p className="sub" style={{ marginBottom: 12 }}>
          Esta música ainda não foi materializada no grid de células — necessário
          para declarar instrumentos e medir completude.
        </p>
        <button type="button" onClick={materialize} disabled={busy}>
          {busy ? "Materializando…" : "Materializar grid"}
        </button>
        {error && <div className="form-error">{error}</div>}
      </div>
    );
  }

  return (
    <div>
      {/* Track rows */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-header">
          Trilhas
          <span style={{ fontWeight: 400, color: "var(--accent)", fontSize: "0.82rem" }}>
            {data.percent}% completo
          </span>
        </div>
        <div className="card-body">
          {data.tracks.map((t) => (
            <div key={t.id} className="comp-track-row">
              <div className="comp-track-top">
                <span className="comp-track-name">
                  {t.name}
                  {t.ownerName && (
                    <span className="tag" style={{ marginLeft: 6 }}>{t.ownerName}</span>
                  )}
                </span>
                <span className="comp-track-pct">{t.percent}%</span>
              </div>
              <div className="comp-bar">
                <div className="comp-bar-fill" style={{ width: `${t.percent}%` }} />
              </div>
            </div>
          ))}

          {data.missing.length > 0 && (
            <div className="comp-missing-block">
              <div className="comp-missing-label">Faltando</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {data.missing.map((m) => (
                  <span key={m} className="tag">falta {m}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Declare instrument */}
      <div className="card">
        <div className="card-header">Declarar instrumento</div>
        <div className="card-body">
          <div className="row">
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="preset">Instrumento</label>
              <select
                id="preset"
                value={presetKey}
                onChange={(e) => setPresetKey(e.target.value)}
              >
                {presets.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="trackname">Nome (opcional)</label>
              <input
                id="trackname"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex.: Baixo"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={declare}
            disabled={busy}
            className="secondary"
            style={{ width: "100%", marginTop: 10 }}
          >
            {busy ? "Declarando…" : "Declarar slot (nasce vazio, sem dono)"}
          </button>
          {error && <div className="form-error">{error}</div>}
        </div>
      </div>
    </div>
  );
}
