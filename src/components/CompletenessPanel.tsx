"use client";

import { useCallback, useEffect, useState } from "react";
import InstrumentPicker, { defaultSpec, specLabel } from "@/components/InstrumentPicker";
import type { DeclareSpec } from "@/lib/instrument-presets";

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
// Menu recolhível no rodapé da aba Colaborar. Fechado, mostra só "X% completo";
// aberto, exibe a porcentagem por instrumento e permite declarar um que falta.
export default function CompletenessPanel({ songId }: { songId: string }) {
  const [data, setData] = useState<Completeness | null>(null);
  const [spec, setSpec] = useState<DeclareSpec>(defaultSpec);
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
  }, [load]);

  async function declare() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/songs/${songId}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...spec, name: name.trim() || undefined }),
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
      {/* Gaveta, que abre para cima */}
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
              {name.trim() ? (
                <>vai aparecer como <strong>{specLabel(spec)} — {name.trim()}</strong></>
              ) : (
                <>Cria uma trilha vazia e sem dono — o convite para alguém assumir.</>
              )}
            </p>
            <div className="completeness-declare-row">
              <InstrumentPicker value={spec} onChange={setSpec} disabled={busy} />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="nome (opcional), ex.: Fender do Mick"
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
