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
 * Rebaixa a cor das hastes/beams/flags/quiálteras do ritmo da tablatura para
 * perto da cor das linhas da pauta: a duração fica legível sem competir com os
 * números (estilo Songsterr). Chamar no `scoreLoaded`, antes do render — o
 * alphaTab não tem cor global só para o ritmo da tab, então é por beat.
 * Reaproveita `beat.style` existente (o verde do diff de proposta, por exemplo).
 */
export function muteTabRhythm(
  at: typeof AlphaTabNS,
  score: AlphaTabNS.model.Score,
  theme: Theme,
): void {
  const [r, g, b] = theme === "light" ? [184, 177, 164] : [92, 87, 77];
  const dim = new at.model.Color(r, g, b, 255);
  const parts = [
    at.model.BeatSubElement.GuitarTabStem,
    at.model.BeatSubElement.GuitarTabBeams,
    at.model.BeatSubElement.GuitarTabFlags,
    at.model.BeatSubElement.GuitarTabTuplet,
  ];
  for (const track of score.tracks)
    for (const staff of track.staves)
      for (const bar of staff.bars)
        for (const voice of bar.voices)
          for (const beat of voice.beats) {
            const bs = beat.style ?? new at.model.BeatStyle();
            for (const p of parts) bs.colors.set(p, dim);
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
