"use client";

import { useEffect, useRef, useState } from "react";

// Types only — the actual module is imported dynamically inside the effect so
// it never runs during SSR (alphaTab touches `window`/`document`).
type AlphaTabModule = typeof import("@coderline/alphatab");
type AlphaTabApi = InstanceType<AlphaTabModule["AlphaTabApi"]>;
type Score = NonNullable<AlphaTabApi["score"]>;
type Track = Score["tracks"][number];

export type PlayerRevision = {
  id: string;
  format: string; // "gp" | "musicxml" | "alphatex"
  source: string; // "file" | "alphatex"
};

type Status = "loading" | "ready" | "error";

export default function AlphaTabPlayer({ revision }: { revision: PlayerRevision }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<AlphaTabApi | null>(null);
  const scoreRef = useRef<Score | null>(null);

  const [apiReady, setApiReady] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tracks, setTracks] = useState<{ index: number; name: string }[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [playerReady, setPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // --- Initialize the alphaTab API once. ---
  useEffect(() => {
    let api: AlphaTabApi | null = null;
    let disposed = false;

    (async () => {
      const alphaTab = await import("@coderline/alphatab");
      if (disposed || !surfaceRef.current) return;

      api = new alphaTab.AlphaTabApi(surfaceRef.current, {
        core: {
          // Assets are copied into /public by the alphaTab webpack plugin.
          fontDirectory: "/font/",
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
        const list = score.tracks.map((t: Track) => ({
          index: t.index,
          name: t.name?.trim() || `Trilha ${t.index + 1}`,
        }));
        setTracks(list);
        setSelected(new Set(list.map((t) => t.index)));
        setStatus("ready");
        setErrorMessage(null);
      });

      api.playerReady.on(() => setPlayerReady(true));

      api.playerStateChanged.on((e) => {
        setIsPlaying(e.state === alphaTab.synth.PlayerState.Playing);
      });

      api.error.on((error) => {
        const message =
          error instanceof Error ? error.message : "Erro desconhecido.";
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

  // --- Load the current revision whenever it changes (and api is ready). ---
  useEffect(() => {
    const api = apiRef.current;
    if (!apiReady || !api) return;

    let cancelled = false;
    setStatus("loading");
    setErrorMessage(null);
    setPlayerReady(false);
    setIsPlaying(false);

    (async () => {
      try {
        const res = await fetch(`/api/revisions/${revision.id}/file`);
        if (!res.ok) {
          throw new Error(`Falha ao buscar a revisão (HTTP ${res.status}).`);
        }

        if (cancelled) return;

        if (revision.source === "alphatex") {
          const text = await res.text();
          api.tex(text);
        } else {
          const buffer = await res.arrayBuffer();
          const loaded = api.load(new Uint8Array(buffer));
          if (!loaded) {
            throw new Error(
              "alphaTab não conseguiu interpretar este arquivo. " +
                (revision.format === "musicxml"
                  ? "O suporte a MusicXML é experimental; tente exportar como Guitar Pro."
                  : "O arquivo pode estar corrompido ou em um formato não suportado."),
            );
          }
        }
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Erro ao carregar a revisão.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiReady, revision.id, revision.source, revision.format]);

  function toggleTrack(index: number) {
    const api = apiRef.current;
    const score = scoreRef.current;
    if (!api || !score) return;

    const next = new Set(selected);
    if (next.has(index)) {
      if (next.size === 1) return; // keep at least one track visible
      next.delete(index);
    } else {
      next.add(index);
    }
    setSelected(next);

    const tracksToRender = score.tracks.filter((t: Track) => next.has(t.index));
    api.renderTracks(tracksToRender);
  }

  function handlePlayPause() {
    apiRef.current?.playPause();
  }

  function handleStop() {
    apiRef.current?.stop();
  }

  return (
    <div className="player">
      <div className="player-toolbar">
        <button
          type="button"
          onClick={handlePlayPause}
          disabled={!playerReady || status !== "ready"}
        >
          {isPlaying ? "Pausar" : "Tocar"}
        </button>
        <button
          type="button"
          onClick={handleStop}
          disabled={!playerReady || status !== "ready"}
        >
          Parar
        </button>
        {!playerReady && status === "ready" && (
          <span className="muted">carregando áudio…</span>
        )}
      </div>

      {tracks.length > 0 && status === "ready" && (
        <div className="player-tracks">
          <span className="muted">Trilhas:</span>
          {tracks.map((t) => (
            <label key={t.index} className="track-toggle">
              <input
                type="checkbox"
                checked={selected.has(t.index)}
                onChange={() => toggleTrack(t.index)}
              />
              {t.name}
            </label>
          ))}
        </div>
      )}

      {status === "error" && (
        <div className="player-error" role="alert">
          <strong>Não foi possível renderizar esta revisão.</strong>
          <div>{errorMessage}</div>
        </div>
      )}

      <div
        ref={viewportRef}
        id="at-viewport"
        className="player-viewport"
        aria-busy={status === "loading"}
      >
        {status === "loading" && <div className="player-loading">Carregando…</div>}
        <div ref={surfaceRef} className="player-surface" />
      </div>
    </div>
  );
}
