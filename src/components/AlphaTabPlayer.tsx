"use client";

import {
  type CSSProperties,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { instrumentLabel } from "@/lib/instruments";
import { TAB_RHYTHM_HEIGHT, alphaTabResources, muteTabRhythm, readTheme } from "@/lib/theme";
import {
  PREFS_EVENT,
  readPlayerPrefs,
  type PlayerPrefs,
  type StaveProfile,
} from "@/lib/player-prefs";

type AlphaTabModule = typeof import("@coderline/alphatab");
type AlphaTabApi = InstanceType<AlphaTabModule["AlphaTabApi"]>;
type Score = NonNullable<AlphaTabApi["score"]>;
type Track = Score["tracks"][number];

export type PlayerRevision = {
  id: string;
  format: string;
  source: string;
};

/** Controle imperativo exposto por ref no modo de edição. */
export type AlphaTabPlayerHandle = {
  playPause: () => void;
  /** Exibe a trilha de índice `index` (0-based) no player. */
  selectTrack: (index: number) => void;
  /** Move a posição de playback para um tick musical (seek). */
  seekTick: (tick: number) => void;
  /** Carrega um documento alphaTex direto (preview de edição não salva). */
  loadTex: (tex: string) => void;
  /** True quando o áudio do score atual está pronto para tocar. */
  isReadyForPlayback: () => boolean;
};

type Status = "loading" | "ready" | "error";

/** Volume das trilhas que NÃO são a selecionada (multiplicador do mix). A
 *  música inteira continua tocando — é o revezamento soando junto —, mas a
 *  trilha escolhida fica à frente. Sem isso, um instrumento em uníssono com
 *  outro (guitarra limpa × overdrive, por exemplo) some na mistura e parece
 *  que o timbre declarado não funcionou. */
const BACKGROUND_TRACK_VOLUME = 0.3;

/** Soundfont extra com os presets de guitarra (GM 24–31), anexado por cima do
 *  sonivox. No banco padrão do alphaTab (SONiVOX EAS, o wavetable embarcado do
 *  Android) os programas 29 (overdrive) e 30 (distorção) apontam para os MESMOS
 *  samples — loops de 11 kHz, sem nada acima de ~5,5 kHz, que é onde mora a
 *  fritura que se reconhece como distorção. Limpa, overdrive e distorção soavam
 *  iguais. Ver `public/sf/README.md` (origem, licença e como foi gerado). */
const GUITAR_SOUNDFONT_URL = "/sf/guitars.sf2";

/** Preferências aplicáveis sem re-renderizar a partitura (só áudio). */
function applyPlaybackPrefs(api: AlphaTabApi, prefs: PlayerPrefs) {
  api.masterVolume = prefs.volume;
  api.playbackSpeed = prefs.speed;
  api.metronomeVolume = prefs.metronome ? 1 : 0;
  api.countInVolume = prefs.countIn ? 1 : 0;
}

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
    /** true: layout de página inteira com barra inferior (página da música).
     *  false (padrão): toolbar no topo + transporte (histórico, comparação). */
    fullpage?: boolean;
    /** Trilha exibida ao carregar. Padrão: a primeira. */
    defaultTrackIndex?: number;
    /** Beats a destacar em verde na trilha exibida, no formato
     *  "measureIndex:beatIndex" (voz 0). Mostra o diff de uma proposta. */
    highlightBeats?: string[];
    /** true: tablatura em largura total, sem controles próprios. O play/pause
     *  vem de fora, pelo handle da ref. */
    editMode?: boolean;
    /** true (com editMode): modo headless. Mantém a instância viva só pelo
     *  áudio, sem tablatura visível — na tela de edição o espaço é do editor,
     *  e o play toca a música completa. */
    audioOnly?: boolean;
    /** Chamado quando o estado de reprodução muda (só no modo de edição). */
    onPlayingChange?: (playing: boolean) => void;
    /** Chamado quando o player fica pronto (só no modo de edição). */
    onPlayerReadyChange?: (ready: boolean) => void;
    /** Posição de playback em ticks, para sincronizar o cursor do editor visual
     *  com a música que toca aqui. */
    onTickChange?: (currentTick: number) => void;
  }
>(function AlphaTabPlayer(
  {
    revision,
    alphaTexUrl,
    fullpage = false,
    defaultTrackIndex,
    highlightBeats,
    editMode = false,
    audioOnly = false,
    onPlayingChange,
    onPlayerReadyChange,
    onTickChange,
  },
  ref,
) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<AlphaTabApi | null>(null);
  const alphaTabRef = useRef<AlphaTabModule | null>(null);
  const scoreRef = useRef<Score | null>(null);
  const scrubbingRef = useRef(false);
  // Callback de tick sempre atual: o handler do alphaTab é registrado uma vez.
  const onTickChangeRef = useRef(onTickChange);
  onTickChangeRef.current = onTickChange;
  const defaultTrackIndexRef = useRef(defaultTrackIndex);
  defaultTrackIndexRef.current = defaultTrackIndex;
  const highlightBeatsRef = useRef(highlightBeats);
  highlightBeatsRef.current = highlightBeats;
  // Perfil de pauta preferido, vindo das Configurações. O aplicado pode diferir
  // por trilha: ver applyStaveProfileFor.
  const prefStaveProfileRef = useRef<StaveProfile>("Tab");
  // Trilha em destaque no mix. Em ref porque os handlers do alphaTab são
  // registrados uma vez só e precisam do valor atual.
  const emphasisIndexRef = useRef(0);

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

  // Põe a trilha selecionada à frente no mix e abaixa as demais. O alphaTab
  // gera o MIDI da partitura inteira e `renderTracks` só muda o que é
  // DESENHADO: sem mexer no volume por canal, o áudio é sempre a mistura cheia.
  function applyTrackEmphasis(index: number) {
    const api = apiRef.current;
    const score = scoreRef.current;
    if (!api || !score) return;
    emphasisIndexRef.current = index;
    const selected = score.tracks.filter((t: Track) => t.index === index);
    const others = score.tracks.filter((t: Track) => t.index !== index);
    api.changeTrackVolume(others, BACKGROUND_TRACK_VOLUME);
    api.changeTrackVolume(selected, 1);
  }

  // Percussão não tem tablatura de cordas, e renderizá-la com o perfil "só tab"
  // quebra o layout do alphaTab. Trilha de bateria força um perfil com
  // partitura; as demais restauram a preferência da pessoa.
  function applyStaveProfileFor(track: Track) {
    const api = apiRef.current;
    const alphaTab = alphaTabRef.current;
    if (!api || !alphaTab) return;
    const isPercussion = track.playbackInfo?.primaryChannel === 9;
    const wanted =
      isPercussion || prefStaveProfileRef.current === "ScoreTab"
        ? alphaTab.StaveProfile.ScoreTab
        : alphaTab.StaveProfile.Tab;
    // Só tab: ritmo sutil pedido explícito (o Automatic olha o flag do modelo e
    // esconderia tudo). Com pauta em cima (ScoreTab), o ritmo já está na pauta.
    const wantedRhythm =
      wanted === alphaTab.StaveProfile.Tab
        ? alphaTab.TabRhythmMode.ShowWithBars
        : alphaTab.TabRhythmMode.Automatic;
    if (
      api.settings.display.staveProfile !== wanted ||
      api.settings.notation.rhythmMode !== wantedRhythm
    ) {
      api.settings.display.staveProfile = wanted;
      api.settings.notation.rhythmMode = wantedRhythm;
      api.updateSettings();
    }
  }

  // Controle imperativo para quem usa o player em modo de edição.
  useImperativeHandle(ref, () => ({
    playPause: () => apiRef.current?.playPause(),
    selectTrack: (index: number) => selectTrack(index),
    seekTick: (tick: number) => {
      const api = apiRef.current;
      if (api) api.tickPosition = tick;
    },
    loadTex: (tex: string) => {
      try {
        apiRef.current?.tex(tex);
      } catch {
        // erros de parse já chegam por api.error e viram status "error"
      }
    },
    isReadyForPlayback: () => apiRef.current?.isReadyForPlayback ?? false,
  }));

  // Propaga os estados de reprodução e prontidão para o componente pai.
  useEffect(() => { onPlayingChange?.(isPlaying); }, [isPlaying, onPlayingChange]);
  useEffect(() => { onPlayerReadyChange?.(playerReady); }, [playerReady, onPlayerReadyChange]);

  useEffect(() => {
    let api: AlphaTabApi | null = null;
    let disposed = false;
    const prefs = readPlayerPrefs();
    prefStaveProfileRef.current = prefs.staveProfile;

    (async () => {
      const alphaTab = await import("@coderline/alphatab");
      if (disposed || !surfaceRef.current) return;
      alphaTabRef.current = alphaTab;

      api = new alphaTab.AlphaTabApi(surfaceRef.current, {
        core: { fontDirectory: "/font/" },
        display: {
          staveProfile: prefs.staveProfile,
          scale: prefs.scale,
          // O alphaTab desenha em canvas próprio e não herda CSS: as cores da
          // tablatura vêm do tema lido na montagem.
          resources: alphaTabResources(readTheme()),
        },
        notation: {
          // Ritmo sutil abaixo da tab (ver applyStaveProfileFor / muteTabRhythm).
          rhythmMode:
            prefs.staveProfile === "ScoreTab"
              ? alphaTab.TabRhythmMode.Automatic
              : alphaTab.TabRhythmMode.ShowWithBars,
          rhythmHeight: TAB_RHYTHM_HEIGHT,
        },
        player: {
          enablePlayer: true,
          // No modo headless o surface fica fora da tela: cursor e scroll não
          // teriam onde acontecer.
          enableCursor: !audioOnly,
          enableUserInteraction: true,
          soundFont: "/soundfont/sonivox.sf2",
          scrollElement: audioOnly ? undefined : viewportRef.current ?? undefined,
          scrollMode: audioOnly
            ? alphaTab.ScrollMode.Off
            : alphaTab.ScrollMode.Continuous,
        },
      });

      api.scoreLoaded.on((score) => {
        scoreRef.current = score;
        // Pauta de percussão usa clave neutra (‖), mas o importer de alphaTex
        // deixa clave de sol — e o próprio exporter escreve "\clef g2" para
        // bateria. Normaliza no modelo antes do render; símbolos e posições das
        // notas já vêm certos do mapa de percussão.
        score.tracks.forEach((t) => {
          t.staves.forEach((staff) => {
            if (!staff.isPercussion) return;
            staff.bars.forEach((bar) => {
              bar.clef = alphaTab.model.Clef.Neutral;
            });
          });
        });
        // Compassos consecutivos só de pausa viram um multi-bar rest (um
        // compasso único com o número em cima, como em partitura impressa) —
        // uma trilha que entra no compasso 20 não gasta 19 compassos vazios.
        score.stylesheet.multiTrackMultiBarRest = true;
        score.stylesheet.perTrackMultiBarRest = new Set(
          score.tracks.map((t: Track) => t.index),
        );
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
        const wanted = defaultTrackIndexRef.current;
        const firstIndex =
          wanted != null && list.some((t) => t.index === wanted)
            ? wanted
            : list[0]?.index ?? 0;
        setSelectedTrackIndex(firstIndex);
        const firstTrack = score.tracks.find((t) => t.index === firstIndex);
        // Diff na partitura: pinta de verde as notas mudadas ou novas.
        const set = highlightBeatsRef.current;
        if (firstTrack && set && set.length > 0) {
          const wanted = new Set(set);
          const green = new alphaTab.model.Color(63, 185, 80, 255);
          firstTrack.staves.forEach((staff) => {
            staff.bars.forEach((bar, measureIndex) => {
              bar.voices[0]?.beats.forEach((beat, beatIndex) => {
                if (!wanted.has(`${measureIndex}:${beatIndex}`)) return;
                const bs = new alphaTab.model.BeatStyle();
                bs.colors.set(alphaTab.model.BeatSubElement.GuitarTabRests, green);
                bs.colors.set(alphaTab.model.BeatSubElement.StandardNotationRests, green);
                beat.style = bs;
                for (const note of beat.notes) {
                  const ns = new alphaTab.model.NoteStyle();
                  ns.colors.set(alphaTab.model.NoteSubElement.GuitarTabFretNumber, green);
                  ns.colors.set(alphaTab.model.NoteSubElement.GuitarTabEffects, green);
                  // Percussão renderiza em partitura, não em tablatura: pinta
                  // também a cabeça da nota na notação padrão.
                  ns.colors.set(alphaTab.model.NoteSubElement.StandardNotationNoteHead, green);
                  ns.colors.set(alphaTab.model.NoteSubElement.StandardNotationEffects, green);
                  note.style = ns;
                }
              });
            });
          });
        }
        // Depois do diff verde, para reaproveitar o beat.style dele: o ritmo da
        // tab fica em cor rebaixada (sutil), sem apagar o destaque.
        muteTabRhythm(alphaTab, score, readTheme());
        if (firstTrack) {
          applyStaveProfileFor(firstTrack);
          apiRef.current?.renderTracks([firstTrack]);
        }
        applyTrackEmphasis(firstIndex);
        setStatus("ready");
        setErrorMessage(null);
      });

      // `player.soundFont` carrega o sonivox com append=false; só depois que ele
      // termina dá para anexar as guitarras, senão a carga do banco base
      // substituiria o que foi anexado. O evento dispara a cada carga (inclusive
      // a nossa), daí a trava de uma vez só.
      let guitarsRequested = false;
      api.soundFontLoaded.on(() => {
        if (guitarsRequested || disposed) return;
        guitarsRequested = true;
        api?.loadSoundFont(GUITAR_SOUNDFONT_URL, true);
      });

      api.playerReady.on(() => {
        setPlayerReady(true);
        // O mix é do sintetizador: reaplica quando ele fica pronto, para o caso
        // de o score ter carregado antes do áudio.
        applyTrackEmphasis(emphasisIndexRef.current);
      });
      api.playerStateChanged.on((e) => {
        setIsPlaying(e.state === alphaTab.synth.PlayerState.Playing);
      });
      api.playerPositionChanged.on((e) => {
        setEndTimeMs(e.endTime);
        if (!scrubbingRef.current) setCurrentTimeMs(e.currentTime);
        // Encaminha o tick para sincronizar o cursor do editor visual.
        onTickChangeRef.current?.(e.currentTick);
      });
      api.error.on((error) => {
        const message = error instanceof Error ? error.message : "Erro desconhecido.";
        setStatus("error");
        setErrorMessage(message);
      });

      applyPlaybackPrefs(api, prefs);

      apiRef.current = api;
      setApiReady(true);
    })();

    return () => {
      disposed = true;
      apiRef.current = null;
      alphaTabRef.current = null;
      scoreRef.current = null;
      api?.destroy();
    };
  }, []);

  // Aplica no player já montado as preferências salvas nas configurações, sem
  // recarregar a partitura. Volume e velocidade são propriedades vivas; escala e
  // perfil de pauta exigem re-render.
  useEffect(() => {
    function onPrefs(event: Event) {
      const api = apiRef.current;
      const alphaTab = alphaTabRef.current;
      if (!api || !alphaTab) return;
      const prefs = (event as CustomEvent<PlayerPrefs>).detail;

      applyPlaybackPrefs(api, prefs);
      prefStaveProfileRef.current = prefs.staveProfile;

      const display = api.settings.display;
      // O perfil considera a trilha exibida: bateria força partitura.
      const shown = api.tracks?.[0];
      const wantedProfile =
        shown?.playbackInfo?.primaryChannel === 9 || prefs.staveProfile === "ScoreTab"
          ? alphaTab.StaveProfile.ScoreTab
          : alphaTab.StaveProfile.Tab;
      const wantedRhythm =
        wantedProfile === alphaTab.StaveProfile.Tab
          ? alphaTab.TabRhythmMode.ShowWithBars
          : alphaTab.TabRhythmMode.Automatic;
      if (
        display.scale !== prefs.scale ||
        display.staveProfile !== wantedProfile ||
        api.settings.notation.rhythmMode !== wantedRhythm
      ) {
        display.scale = prefs.scale;
        display.staveProfile = wantedProfile;
        api.settings.notation.rhythmMode = wantedRhythm;
        api.updateSettings();
        api.render();
      }
    }
    window.addEventListener(PREFS_EVENT, onPrefs);
    return () => window.removeEventListener(PREFS_EVENT, onPrefs);
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
    if (track) {
      applyStaveProfileFor(track);
      api.renderTracks([track]);
    }
    applyTrackEmphasis(index);
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

  // ── Modo de edição: sem controles próprios ─────────────────────────────────
  if (editMode) {
    // No modo headless o card sai da tela mantendo largura real, para o alphaTab
    // montar o layout sem erro. O surface nunca sai do DOM: a instância segue
    // viva e o play externo continua funcionando.
    const hidden: CSSProperties = {
      position: "absolute",
      left: "-99999px",
      top: 0,
      width: "1200px",
      height: "1px",
      overflow: "hidden",
      pointerEvents: "none",
    };
    return (
      <div
        className="player-card player-card--fullpage"
        style={audioOnly ? hidden : undefined}
        aria-hidden={audioOnly || undefined}
      >
        {!audioOnly && status === "error" && (
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
          {!audioOnly && status === "loading" && (
            <div className="player-loading">Carregando…</div>
          )}
          <div ref={surfaceRef} className="player-surface" />
        </div>
        {/* Sem barra inferior: o play vem de fora, pela ref. */}
      </div>
    );
  }

  // ── Layout de página inteira (página da música) ────────────────────────────
  if (fullpage) {
    return (
      <div className="player-card player-card--fullpage">
        {status === "error" && (
          <div className="player-error" role="alert">
            <strong>Não foi possível renderizar esta revisão.</strong>
            <div>{errorMessage}</div>
          </div>
        )}

        {/* Viewport rolável da tablatura */}
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

        {/* Barra inferior fixa: play/pause + seletor de trilha */}
        <div className="player-bottombar">
          <button
            type="button"
            className="playpause-btn"
            onClick={handlePlayPause}
            disabled={!playerReady || status !== "ready"}
            title={isPlaying ? "Pausar" : "Tocar"}
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              // Triângulo deslocado ~1px à direita, para o centro óptico.
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                <polygon points="8,5 20,12 8,19" />
              </svg>
            )}
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

  // ── Layout compacto (histórico, comparação, editor de célula) ──────────────
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
