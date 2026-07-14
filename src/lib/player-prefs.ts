// Player/reading preferences. These live in localStorage, NOT in the database:
// they describe an apparatus ("nesta tela eu quero a tablatura maior"), not an
// identity — so they need no migration, no round trip, and no account.
//
// The player reads them when it mounts and listens for PREFS_EVENT so a change in
// the settings page is felt immediately by any player already on screen.

export type StaveProfile = "Tab" | "ScoreTab";

export type PlayerPrefs = {
  /** "Tab" = só tablatura; "ScoreTab" = partitura + tablatura. */
  staveProfile: StaveProfile;
  /** Zoom da tablatura (alphaTab display.scale). */
  scale: number;
  /** Velocidade de reprodução (1 = original). */
  speed: number;
  /** Volume geral, 0..1. */
  volume: number;
  /** Metrônomo audível durante a reprodução. */
  metronome: boolean;
  /** Compasso de contagem antes de começar a tocar. */
  countIn: boolean;
};

export const DEFAULT_PLAYER_PREFS: PlayerPrefs = {
  staveProfile: "Tab",
  scale: 1.1,
  speed: 1,
  volume: 0.8,
  metronome: false,
  countIn: false,
};

const STORAGE_KEY = "gs.player.prefs";
export const PREFS_EVENT = "gs:player-prefs";

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Coerce whatever is in storage into a valid prefs object (never throws). */
function coerce(raw: unknown): PlayerPrefs {
  const p = (raw ?? {}) as Partial<PlayerPrefs>;
  return {
    staveProfile: p.staveProfile === "ScoreTab" ? "ScoreTab" : "Tab",
    scale: typeof p.scale === "number" ? clamp(p.scale, 0.7, 2) : DEFAULT_PLAYER_PREFS.scale,
    speed: typeof p.speed === "number" ? clamp(p.speed, 0.25, 2) : DEFAULT_PLAYER_PREFS.speed,
    volume: typeof p.volume === "number" ? clamp(p.volume, 0, 1) : DEFAULT_PLAYER_PREFS.volume,
    metronome: p.metronome === true,
    countIn: p.countIn === true,
  };
}

/** SSR-safe: returns the defaults on the server. */
export function readPlayerPrefs(): PlayerPrefs {
  if (typeof window === "undefined") return DEFAULT_PLAYER_PREFS;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return coerce(stored ? JSON.parse(stored) : null);
  } catch {
    return DEFAULT_PLAYER_PREFS;
  }
}

/** Persist and tell every mounted player to apply it right away. */
export function writePlayerPrefs(prefs: PlayerPrefs): PlayerPrefs {
  const next = coerce(prefs);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* private mode / storage cheio: a preferência simplesmente não persiste */
  }
  window.dispatchEvent(new CustomEvent<PlayerPrefs>(PREFS_EVENT, { detail: next }));
  return next;
}
