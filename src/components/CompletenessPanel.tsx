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
  if (data.tracks.length === 0) {
    return (
      <div className="panel">
        <p className="muted">
          Esta música ainda não foi materializada no grid de células (necessário
          para declarar instrumentos e medir completude).
        </p>
        <button type="button" onClick={materialize} disabled={busy}>
          {busy ? "Materializando…" : "Materializar grid de células"}
        </button>
        {error && <div className="form-error">{error}</div>}
      </div>
    );
  }

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <strong>Completude</strong>
        <span className="muted">{data.percent}% no total</span>
      </div>

      {data.tracks.map((t) => (
        <div key={t.id} className="track-row">
          <div>
            <div className="track-name">
              {t.name}
              {t.ownerName ? (
                <span className="badge">{t.ownerName}</span>
              ) : (
                <span className="badge">sem dono</span>
              )}
            </div>
            <div
              className={`bar${t.percent === 100 ? " full" : t.percent === 0 ? " empty" : ""}`}
            >
              <span style={{ width: `${t.percent}%` }} />
            </div>
          </div>
          <div className="pct">{t.percent}%</div>
        </div>
      ))}

      {data.missing.length > 0 && (
        <div className="missing-tags">
          {data.missing.map((m) => (
            <span key={m} className="missing-tag">
              falta {m}
            </span>
          ))}
        </div>
      )}

      <div className="row" style={{ marginTop: 14 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="preset">Declarar instrumento que falta</label>
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
      <button type="button" onClick={declare} disabled={busy} style={{ marginTop: 8 }}>
        {busy ? "Declarando…" : "Declarar slot (nasce vazio, sem dono)"}
      </button>
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}
