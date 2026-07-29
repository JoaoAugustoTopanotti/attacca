// Preferências de reprodução e leitura. Vivem no localStorage, não no banco:
// descrevem um aparelho ("nesta tela eu quero a tablatura maior"), não uma
// identidade, então não exigem conta nem migração.
//
// O player lê ao montar e escuta PREFS_EVENT, para uma mudança nas configurações
// valer na hora em qualquer player já na tela.

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

/** Converte o que estiver no storage num objeto de preferências válido. Nunca lança. */
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

/** Seguro no SSR: devolve os padrões quando roda no servidor. */
export function readPlayerPrefs(): PlayerPrefs {
  if (typeof window === "undefined") return DEFAULT_PLAYER_PREFS;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return coerce(stored ? JSON.parse(stored) : null);
  } catch {
    return DEFAULT_PLAYER_PREFS;
  }
}

/** Persiste e avisa os players montados para aplicarem na hora. */
export function writePlayerPrefs(prefs: PlayerPrefs): PlayerPrefs {
  const next = coerce(prefs);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* modo privado ou storage cheio: a preferência não persiste */
  }
  window.dispatchEvent(new CustomEvent<PlayerPrefs>(PREFS_EVENT, { detail: next }));
  return next;
}
