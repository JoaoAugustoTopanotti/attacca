// Tema visual: escuro por padrão, claro opcional nas Configurações.
// Como as preferências do player, descreve um aparelho e não uma identidade,
// então vive em localStorage e não no banco.

import type * as AlphaTabNS from "@coderline/alphatab";

export type Theme = "dark" | "light";

export const THEME_KEY = "attacca:theme";

export function readTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    return window.localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

/** Aplica no `<html>` (o CSS reage via [data-theme]) e persiste a escolha. */
export function applyTheme(theme: Theme): Theme {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = theme;
  }
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // sem localStorage (modo privado): o tema vale só até o reload
  }
  return theme;
}

/**
 * Cores da tablatura (alphaTab display.resources) por tema.
 * O alphaTab desenha em canvas/SVG próprio e não enxerga o CSS, então quem monta
 * um player lê o tema na inicialização e passa estas cores.
 */
/**
 * Altura da notação de ritmo abaixo da tablatura (haste + beams), em pixels
 * antes da escala. O default do alphaTab (25) ficou "gigante" — 12 aproxima do
 * Songsterr. Usada junto de `TabRhythmMode.ShowWithBars` por quem renderiza tab.
 */
export const TAB_RHYTHM_HEIGHT = 12;

/**
 * Prepara o ritmo da tablatura para o overlay estilo Songsterr
 * (`src/lib/tab-rhythm.ts`): haste/beam/bandeirola do alphaTab ficam com ALFA 0
 * — invisíveis, mas o rhythmMode ligado continua reservando o espaço vertical
 * da faixa entre os sistemas (a haste nativa desce da nota atravessando as
 * cordas, rejeitada no teste visual). Ponto de aumento e número de quiáltera
 * seguem do alphaTab, rebaixados para perto da cor das linhas. Chamar no
 * `scoreLoaded`, antes do render; não há cor global só do ritmo, então é por
 * beat — reaproveita `beat.style` existente (o verde do diff de proposta).
 */
export function muteTabRhythm(
  at: typeof AlphaTabNS,
  score: AlphaTabNS.model.Score,
  theme: Theme,
): void {
  const [r, g, b] = theme === "light" ? [163, 156, 143] : [107, 102, 91];
  const dim = new at.model.Color(r, g, b, 255);
  const invisible = new at.model.Color(0, 0, 0, 0);
  const hidden = [
    at.model.BeatSubElement.GuitarTabStem,
    at.model.BeatSubElement.GuitarTabBeams,
    at.model.BeatSubElement.GuitarTabFlags,
  ];
  const dimmed = [
    at.model.BeatSubElement.GuitarTabTuplet,
    at.model.BeatSubElement.GuitarTabEffects, // ponto de aumento (e tremolo)
  ];
  for (const track of score.tracks)
    for (const staff of track.staves)
      for (const bar of staff.bars)
        for (const voice of bar.voices)
          for (const beat of voice.beats) {
            const bs = beat.style ?? new at.model.BeatStyle();
            for (const p of hidden) bs.colors.set(p, invisible);
            for (const p of dimmed) bs.colors.set(p, dim);
            beat.style = bs;
          }
}

export function alphaTabResources(theme: Theme) {
  return theme === "light"
    ? {
        mainGlyphColor: "#141414",
        secondaryGlyphColor: "#6e6862",
        scoreInfoColor: "#0f0f0f",
        staffLineColor: "#d8d2c6",
        barSeparatorColor: "#d8d2c6",
        barNumberColor: "#a7a199",
      }
    : {
        mainGlyphColor: "#ede9e2",
        secondaryGlyphColor: "#b9b3a9",
        scoreInfoColor: "#f5f2ec",
        staffLineColor: "#3a372f",
        barSeparatorColor: "#3a372f",
        barNumberColor: "#8b857b",
      };
}
