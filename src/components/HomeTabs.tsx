"use client";

import Link from "next/link";
import { useState } from "react";

type Song = {
  id: string;
  title: string;
  artist: string | null;
  percent: number;
  missing: string[];
  tracks: number; // number of declared tracks
};

export default function HomeTabs({
  tocar,
  colaborar,
}: {
  tocar: Song[];
  colaborar: Song[];
}) {
  const [tab, setTab] = useState<"tocar" | "colaborar">("tocar");

  return (
    <>
      <div className="tabs-bar">
        <div className="tabs">
          <button
            className={`tab ${tab === "tocar" ? "active" : ""}`}
            onClick={() => setTab("tocar")}
          >
            Tocar
          </button>
          <button
            className={`tab ${tab === "colaborar" ? "active" : ""}`}
            onClick={() => setTab("colaborar")}
          >
            Colaborar
          </button>
        </div>
        {tab === "colaborar" && (
          <Link href="/songs/new" className="btn-new-collab">
            + Nova música
          </Link>
        )}
      </div>

      {/* ── TOCAR ── */}
      {tab === "tocar" && (
        <div className="song-list">
          {tocar.length === 0 ? (
            <div className="empty-state">
              <p>Nenhuma música completa ainda.</p>
              <p className="sub">
                Vá em <strong>Colaborar</strong> para contribuir com uma transcrição.
              </p>
            </div>
          ) : (
            tocar.map((song, i) => (
              <Link key={song.id} href={`/songs/${song.id}`} className="song-row">
                <span className="song-num">{i + 1}</span>
                <span className="play-btn">▶</span>
                <span className="song-meta">
                  <span className="song-name">{song.title}</span>
                  {song.artist && <span className="song-band">{song.artist}</span>}
                </span>
                <span className="song-cta">Tocar →</span>
              </Link>
            ))
          )}
        </div>
      )}

      {/* ── COLABORAR ── */}
      {tab === "colaborar" && (
        <div className="collab-list">
          {colaborar.length === 0 ? (
            <div className="empty-state">
              <p>Todas as músicas estão completas!</p>
              <p className="sub">Crie uma nova música para começar uma transcrição.</p>
            </div>
          ) : (
            colaborar.map((song) => (
              <Link key={song.id} href={`/songs/${song.id}`} className="collab-row">
                <span className="collab-pct">
                  {song.tracks > 0 ? `${song.percent}%` : "—"}
                </span>
                <span className="collab-bar-v">
                  <span
                    className="collab-bar-fill"
                    style={{ height: `${song.percent}%` }}
                  />
                </span>
                <span className="collab-meta">
                  <span className="collab-name">{song.title}</span>
                  {song.artist && <span className="collab-band">{song.artist}</span>}
                  {song.missing.length > 0 && (
                    <span className="collab-needs">
                      falta{" "}
                      <span>{song.missing.join(", ")}</span>
                    </span>
                  )}
                </span>
                <span className="collab-cta">Contribuir →</span>
              </Link>
            ))
          )}
        </div>
      )}
    </>
  );
}
