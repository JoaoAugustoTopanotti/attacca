"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { instrumentLabel } from "@/lib/instruments";

type AlphaTabModule = typeof import("@coderline/alphatab");
type AlphaTabApi = InstanceType<AlphaTabModule["AlphaTabApi"]>;
type Score = NonNullable<AlphaTabApi["score"]>;
type Track = Score["tracks"][number];

export type PlayerRevision = {
  id: string;
  format: string;
  source: string;
};

/** Handle exposed via ref in editMode */
export type AlphaTabPlayerHandle = {
  playPause: () => void;
  /** Exibe a trilha de índice `index` (0-based) no player. */
  selectTrack: (index: number) => void;
};

type Status = "loading" | "ready" | "error";

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const AlphaTabPlayer = forwardRef<
  AlphaTabPlayerHandle,
  {
    revision?: PlayerRevision;
    alphaTexUrl?: string;
    /** fullpage=true: bottom bar layout (song page).
     *  fullpage=false (default): top toolbar + transport (history preview / compare). */
    fullpage?: boolean;
    /** editMode=true: full-width tablature, no built-in controls.
     *  Play/pause is controlled externally via the ref handle. */
    editMode?: boolean;
    /** Called when isPlaying changes (only in editMode). */
    onPlayingChange?: (playing: boolean) => void;
    /** Called when playerReady changes (only in editMode). */
    onPlayerReadyChange?: (ready: boolean) => void;
  }
>(function AlphaTabPlayer(
  {
    revision,
    alphaTexUrl,
    fullpage = false,
    editMode = false,
    onPlayingChange,
    onPlayerReadyChange,
  },
  ref,
) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<AlphaTabApi | null>(null);
  const scoreRef = useRef<Score | null>(null);
  const scrubbingRef = useRef(false);

  const [apiReady, setApiReady] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tracks, setTracks] = useState<
    { index: number; name: string; instrument: string }[]
  >([]);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState(0);
  const [playerReady, setPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [endTimeMs, setEndTimeMs] = useState(0);

  // Expose playPause() and selectTrack() for editMode callers
  useImperativeHandle(ref, () => ({
    playPause: () => apiRef.current?.playPause(),
    selectTrack: (index: number) => {
      const api = apiRef.current;
      const score = scoreRef.current;
      if (!api || !score) return;
      setSelectedTrackIndex(index);
      const track = score.tracks.find((t: Track) => t.index === index);
      if (track) api.renderTracks([track]);
    },
  }));

  // Bubble playing / ready state to parent (editMode)
  useEffect(() => { onPlayingChange?.(isPlaying); }, [isPlaying, onPlayingChange]);
  useEffect(() => { onPlayerReadyChange?.(playerReady); }, [playerReady, onPlayerReadyChange]);

  useEffect(() => {
    let api: AlphaTabApi | null = null;
    let disposed = false;

    (async () => {
      const alphaTab = await import("@coderline/alphatab");
      if (disposed || !surfaceRef.current) return;

      api = new alphaTab.AlphaTabApi(surfaceRef.current, {
        core: { fontDirectory: "/font/" },
        display: {
          staveProfile: "Tab",
          scale: 1.1,
          resources: {
            mainGlyphColor: "#e8eaed",
            secondaryGlyphColor: "#aab2c0",
            scoreInfoColor: "#ffffff",
            staffLineColor: "#39414f",
            barSeparatorColor: "#39414f",
            barNumberColor: "#8c93a3",
          },
        },
        player: {
          enablePlayer: true,
          enableCursor: true,
          enableUserInteraction: true,
          soundFont: "/soundfont/sonivox.sf2",
          scrollElement: viewportRef.current ?? undefined,
          scrollMode: alphaTab.ScrollMode.Continuous,
        },
      });

      api.scoreLoaded.on((score) => {
        scoreRef.current = score;
        const list = score.tracks.map((t: Track) => {
          const pb = t.playbackInfo;
          const isPercussion = pb?.primaryChannel === 9;
          return {
            index: t.index,
            name: t.name?.trim() || `Trilha ${t.index + 1}`,
            instrument: instrumentLabel(pb?.program ?? 0, isPercussion),
          };
        });
        setTracks(list);
        const firstIndex = list[0]?.index ?? 0;
        setSelectedTrackIndex(firstIndex);
        const firstTrack = score.tracks.find((t) => t.index === firstIndex);
        if (firstTrack) apiRef.current?.renderTracks([firstTrack]);
        setStatus("ready");
        setErrorMessage(null);
      });

      api.playerReady.on(() => setPlayerReady(true));
      api.playerStateChanged.on((e) => {
        setIsPlaying(e.state === alphaTab.synth.PlayerState.Playing);
      });
      api.playerPositionChanged.on((e) => {
        setEndTimeMs(e.endTime);
        if (!scrubbingRef.current) setCurrentTimeMs(e.currentTime);
      });
      api.error.on((error) => {
        const message = error instanceof Error ? error.message : "Erro desconhecido.";
        setStatus("error");
        setErrorMessage(message);
      });

      apiRef.current = api;
      setApiReady(true);
    })();

    return () => {
      disposed = true;
      apiRef.current = null;
      scoreRef.current = null;
      api?.destroy();
    };
  }, []);

  useEffect(() => {
    const api = apiRef.current;
    if (!apiReady || !api) return;

    let cancelled = false;
    setStatus("loading");
    setErrorMessage(null);
    setPlayerReady(false);
    setIsPlaying(false);
    setCurrentTimeMs(0);
    setEndTimeMs(0);

    (async () => {
      try {
        const url = alphaTexUrl ?? `/api/revisions/${revision!.id}/file`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Falha ao carregar a partitura (HTTP ${res.status}).`);
        if (cancelled) return;

        if (alphaTexUrl || revision!.source === "alphatex") {
          const text = await res.text();
          api.tex(text);
        } else {
          const buffer = await res.arrayBuffer();
          const loaded = api.load(new Uint8Array(buffer));
          if (!loaded) {
            throw new Error(
              "alphaTab não conseguiu interpretar este arquivo. " +
                (revision!.format === "musicxml"
                  ? "O suporte a MusicXML é experimental; tente exportar como Guitar Pro."
                  : "O arquivo pode estar corrompido ou em um formato não suportado."),
            );
          }
        }
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "Erro ao carregar a partitura.");
      }
    })();

    return () => { cancelled = true; };
  }, [apiReady, alphaTexUrl, revision?.id, revision?.source, revision?.format]);

  function selectTrack(index: number) {
    const api = apiRef.current;
    const score = scoreRef.current;
    if (!api || !score) return;
    setSelectedTrackIndex(index);
    const track = score.tracks.find((t: Track) => t.index === index);
    if (track) api.renderTracks([track]);
  }

  function handlePlayPause() { apiRef.current?.playPause(); }
  function handleStop() { apiRef.current?.stop(); }

  const progress = endTimeMs > 0 ? currentTimeMs / endTimeMs : 0;

  function handleSeekChange(e: React.ChangeEvent<HTMLInputElement>) {
    const fraction = Number(e.target.value);
    const targetMs = fraction * endTimeMs;
    setCurrentTimeMs(targetMs);
    const api = apiRef.current;
    if (api && endTimeMs > 0) api.timePosition = targetMs;
  }

  // ── EDIT MODE (track editor — no built-in controls) ─────────────────
  if (editMode) {
    return (
      <div className="player-card player-card--fullpage">
        {status === "error" && (
          <div className="player-error" role="alert">
            <strong>Não foi possível renderizar esta revisão.</strong>
            <div>{errorMessage}</div>
          </div>
        )}
        <div
          ref={viewportRef}
          id="at-viewport"
          className="player-viewport player-viewport--fullpage"
          aria-busy={status === "loading"}
        >
          {status === "loading" && (
            <div className="player-loading">Carregando…</div>
          )}
          <div ref={surfaceRef} className="player-surface" />
        </div>
        {/* No bottom bar — play is controlled externally via ref */}
      </div>
    );
  }

  // ── FULLPAGE LAYOUT (song player page) ─────────────────────────────
  if (fullpage) {
    return (
      <div className="player-card player-card--fullpage">
        {status === "error" && (
          <div className="player-error" role="alert">
            <strong>Não foi possível renderizar esta revisão.</strong>
            <div>{errorMessage}</div>
          </div>
        )}

        {/* Scrollable tablature viewport */}
        <div
          ref={viewportRef}
          id="at-viewport"
          className="player-viewport player-viewport--fullpage"
          aria-busy={status === "loading"}
        >
          {status === "loading" && (
            <div className="player-loading">Carregando…</div>
          )}
          <div ref={surfaceRef} className="player-surface" />
        </div>

        {/* Fixed bottom bar: play/pause + track selector */}
        <div className="player-bottombar">
          <button
            type="button"
            className="playpause-btn"
            onClick={handlePlayPause}
            disabled={!playerReady || status !== "ready"}
            title={isPlaying ? "Pausar" : "Tocar"}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>

          {tracks.length > 0 && status === "ready" && (
            <div className="track-select-wrap">
              <select
                className="track-select"
                value={selectedTrackIndex}
                onChange={(e) => selectTrack(Number(e.target.value))}
                aria-label="Instrumento / trilha"
              >
                {tracks.map((t) => (
                  <option key={t.index} value={t.index}>
                    {t.name} — {t.instrument}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ flex: 1 }} />

          {!playerReady && status === "ready" && (
            <span className="sub" style={{ fontSize: "0.78rem" }}>
              carregando áudio…
            </span>
          )}
        </div>
      </div>
    );
  }

  // ── COMPACT LAYOUT (history preview / compare / cell editor) ────────
  return (
    <div className="player-card">
      {status === "error" && (
        <div className="player-error" role="alert">
          <strong>Não foi possível renderizar esta revisão.</strong>
          <div>{errorMessage}</div>
        </div>
      )}

      <div className="player-toolbar">
        <button
          type="button"
          className="player-play-btn"
          onClick={handlePlayPause}
          disabled={!playerReady || status !== "ready"}
          aria-label={isPlaying ? "Pausar" : "Tocar"}
        >
          {isPlaying ? "⏸" : "▶"}
        </button>
        <button
          type="button"
          className="player-stop-btn"
          onClick={handleStop}
          disabled={!playerReady || status !== "ready"}
          aria-label="Parar"
        >
          ■
        </button>

        {tracks.length > 0 && status === "ready" && (
          <select
            className="track-select"
            value={selectedTrackIndex}
            onChange={(e) => selectTrack(Number(e.target.value))}
            aria-label="Instrumento / trilha"
          >
            {tracks.map((t) => (
              <option key={t.index} value={t.index}>
                {t.name} — {t.instrument}
              </option>
            ))}
          </select>
        )}

        {!playerReady && status === "ready" && (
          <span className="sub" style={{ fontSize: "0.8rem" }}>
            carregando áudio…
          </span>
        )}
      </div>

      <div className="player-transport">
        <span className="player-time">{formatTime(currentTimeMs)}</span>
        <input
          type="range"
          className="player-seek"
          min={0} max={1} step={0.001}
          value={progress}
          onPointerDown={() => { scrubbingRef.current = true; }}
          onPointerUp={() => { scrubbingRef.current = false; }}
          onChange={handleSeekChange}
          disabled={!playerReady || status !== "ready" || endTimeMs <= 0}
          aria-label="Posição da reprodução"
        />
        <span className="player-time">{formatTime(endTimeMs)}</span>
      </div>

      <div
        ref={viewportRef}
        id="at-viewport"
        className="player-viewport"
        aria-busy={status === "loading"}
      >
        {status === "loading" && (
          <div className="player-loading">Carregando…</div>
        )}
        <div ref={surfaceRef} className="player-surface" />
      </div>
    </div>
  );
});

AlphaTabPlayer.displayName = "AlphaTabPlayer";
export default AlphaTabPlayer;
