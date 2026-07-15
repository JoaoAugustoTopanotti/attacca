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
  /** Uma trilha vazia é de um instrumento que a pessoa declarou tocar. */
  needsYou: boolean;
};

const BLOCKS = 14;

/** A assinatura visual: progresso em blocos (██████░░░░).
 *  Tinta = feito · vermelhão = a borda viva (onde a próxima mão entra) ·
 *  cinza = ainda não começou. */
function BlockBar({ percent }: { percent: number }) {
  const done = Math.round((percent / 100) * BLOCKS);
  return (
    <span className="blockbar" aria-hidden="true">
      {Array.from({ length: BLOCKS }, (_, i) => (
        <i
          key={i}
          className={i < done ? "done" : i === done && percent < 100 ? "edge" : ""}
        />
      ))}
    </span>
  );
}

function MuralRow({ song, mode }: { song: Song; mode: "tocar" | "colaborar" }) {
  const hasGrid = song.tracks > 0;
  const complete = hasGrid && song.percent >= 100;
  const action =
    mode === "tocar"
      ? { label: "Tocar →", go: false }
      : { label: song.percent === 0 ? "Começar →" : "Continuar →", go: true };

  return (
    <Link href={`/songs/${song.id}`} className="mural-row">
      <span className="mural-main">
        <span>
          <span className="mural-title">{song.title}</span>
          {song.artist && <span className="mural-artist">{song.artist}</span>}
          {song.needsYou && (
            <span className="collab-you">precisa do seu instrumento</span>
          )}
        </span>
        <span className={`mural-act ${action.go ? "go" : ""}`}>{action.label}</span>
      </span>
      <span className="mural-prog">
        <BlockBar percent={hasGrid ? song.percent : 0} />
        <span className={`mural-pct ${!hasGrid || complete ? "dim" : ""}`}>
          {hasGrid ? `${song.percent}%` : "—"}
        </span>
        {complete ? (
          <span className="mural-miss done">✓ completa</span>
        ) : !hasGrid ? (
          <span className="mural-miss">ainda sem tablatura — envie um arquivo ou comece do zero</span>
        ) : song.missing.length > 0 ? (
          <span className="mural-miss">
            falta:{" "}
            {song.missing.map((m, i) => (
              <span key={m}>
                {i > 0 && " · "}
                <span className="mi">{m}</span>
              </span>
            ))}
          </span>
        ) : song.percent === 0 ? (
          <span className="mural-miss">ninguém começou — seja a primeira mão</span>
        ) : null}
      </span>
    </Link>
  );
}

export default function HomeTabs({
  tocar,
  colaborar,
}: {
  tocar: Song[];
  colaborar: Song[];
}) {
  const [tab, setTab] = useState<"tocar" | "colaborar">("tocar");
  const total = tocar.length + colaborar.length;

  return (
    <>
      <div className="mural-intro">
        <p className="mural-slogan">
          Alguém começa. <span className="b">Você continua.</span>
        </p>
        <p className="mural-sub">tabs da comunidade, terminadas uma trilha por vez.</p>
        <p className="mural-count mural-meta">
          <span>
            <b>{total}</b> música{total === 1 ? "" : "s"} · <b>{colaborar.length}</b>{" "}
            esperando uma mão
          </span>
        </p>
      </div>

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
        <Link href="/songs/new" className="btn-new-collab">
          + nova música
        </Link>
      </div>

      {/* ── TOCAR ── */}
      {tab === "tocar" && (
        <div className="mural-list">
          {tocar.length === 0 ? (
            <p className="mural-empty">
              nenhuma música completa ainda — em <strong>Colaborar</strong> tem
              transcrição esperando uma mão.
            </p>
          ) : (
            tocar.map((song) => <MuralRow key={song.id} song={song} mode="tocar" />)
          )}
        </div>
      )}

      {/* ── COLABORAR ── */}
      {tab === "colaborar" && (
        <div className="mural-list">
          {colaborar.length === 0 ? (
            <p className="mural-empty">
              todas as músicas estão completas —{" "}
              <Link href="/songs/new">comece uma nova</Link>.
            </p>
          ) : (
            colaborar.map((song) => (
              <MuralRow key={song.id} song={song} mode="colaborar" />
            ))
          )}
        </div>
      )}

      <footer className="mural-foot">
        <p className="mural-eth">Uma transcrição incompleta é um convite para contribuir.</p>
        <p className="mural-fn">
          attacca <span className="dim">(it., música)</span> — emendar no próximo
          movimento, sem pausa.
          <br />
          <span className="dim">uma ferramenta pequena. as tabs são feitas pela comunidade.</span>
        </p>
      </footer>
    </>
  );
}
