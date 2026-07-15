// Tema visual (escuro por padrão; claro opcional nas Configurações).
// Como as preferências do player, descreve um aparelho, não uma identidade —
// vive em localStorage, não no banco.

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

/** Aplica no <html> (o CSS troca via [data-theme]) e persiste. */
export function applyTheme(theme: Theme): Theme {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = theme;
  }
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // sem localStorage (modo privado etc.) — o tema vale só até o reload
  }
  return theme;
}

/**
 * Cores da tablatura (alphaTab display.resources) por tema.
 * O alphaTab desenha num canvas/SVG próprio e não enxerga o CSS — quem monta
 * um player lê o tema na inicialização e passa isto.
 */
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
