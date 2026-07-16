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

// Menu recolhível no rodapé da aba Colaborar: fechado mostra só "X% completo";
// abre para cima com a % por instrumento + declarar um instrumento que falta.
export default function CompletenessPanel({ songId }: { songId: string }) {
  const [data, setData] = useState<Completeness | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetKey, setPresetKey] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

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

  if (!data) return null;

  const hasTracks = data.tracks.length > 0;
  const summary = !hasTracks
    ? "sem instrumentos ainda — envie um arquivo"
    : data.missing.length > 0
      ? `falta alguém em ${data.missing.join(", ")}`
      : "todos os instrumentos presentes";

  return (
    <div className={`completeness${open ? " open" : ""}`}>
      {/* Gaveta (abre para cima) */}
      {open && hasTracks && (
        <div className="completeness-drawer">
          <div className="completeness-tracks">
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
          </div>

          {/* Declarar instrumento que falta */}
          <div className="completeness-declare">
            <div className="completeness-declare-title">
              Falta um instrumento? Declare o slot
            </div>
            <p className="sub" style={{ fontSize: "0.74rem", margin: "0 0 8px" }}>
              Cria uma trilha vazia e sem dono — o convite para alguém assumir.
            </p>
            <div className="completeness-declare-row">
              <select value={presetKey} onChange={(e) => setPresetKey(e.target.value)}>
                {presets.map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome (opcional), ex.: Guitarra 4"
              />
              <button type="button" onClick={declare} disabled={busy} className="completeness-declare-btn">
                {busy ? "…" : "Declarar slot"}
              </button>
            </div>
            {error && <div className="form-error" style={{ marginTop: 6 }}>{error}</div>}
          </div>
        </div>
      )}

      {/* Barra sempre visível */}
      <button
        type="button"
        className="completeness-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="completeness-pct">{hasTracks ? `${data.percent}%` : "—"} completo</span>
        <span className="completeness-summary">{summary}</span>
        <span className="completeness-chevron">{open ? "▾" : "▴"}</span>
      </button>
    </div>
  );
}
