// Modelos alphaTex iniciais para músicas criadas sem upload, usados por
// POST /api/songs/:id/scaffold. Mesmo formato canônico de um `.gp` importado,
// então materializeSongGrid os trata sem nenhum caso especial.

function safeTitle(title: string): string {
  return title.replace(/"/g, "");
}

/** Uma única trilha de guitarra vazia, para tablaturar do zero. */
export function blankAlphaTex(title: string): string {
  return `\\title "${safeTitle(title)}"
\\tempo 120
.
\\track "Guitarra"
\\instrument 25
:4 r r r r | r r r r | r r r r | r r r r
`;
}

/** Modelo padrão: guitarra e baixo, com algumas notas já postas. */
export function attaccaTemplateAlphaTex(title: string): string {
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
