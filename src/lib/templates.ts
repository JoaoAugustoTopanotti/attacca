// Starter alphaTex templates for songs created without an upload — used by
// POST /api/songs/:id/scaffold. Same canonical format as an imported .gp file,
// so materializeSongGrid (src/lib/materialize.ts) handles them unchanged.

function safeTitle(title: string): string {
  return title.replace(/"/g, "");
}

/** A single empty guitar track, ready to tablature from scratch. */
export function blankAlphaTex(title: string): string {
  return `\\title "${safeTitle(title)}"
\\tempo 120
.
\\track "Guitarra"
\\instrument 25
:4 r r r r | r r r r | r r r r | r r r r
`;
}

/** GitSong's default starter: guitar + bass, a few notes already in place. */
export function gitsongTemplateAlphaTex(title: string): string {
  return `\\title "${safeTitle(title)}"
\\tempo 100
.
\\track "Guitarra"
\\instrument 25
:4 0.6 2.6 3.6 0.5 | 2.5 3.5 0.4 2.4 | :2 0.6 3.6
\\track "Baixo"
\\instrument 33
\\tuning G2 D2 A1 E1
:4 0.4 0.4 0.3 0.3 | 0.2 0.2 2.3 2.3 | :2 0.4 0.3
`;
}
