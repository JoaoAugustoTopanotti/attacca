// Afinação de cordas — helpers PUROS (sem prisma/DOM), compartilhados entre o
// servidor (validação/reescrita do header, src/lib/structure.ts) e o client
// (popover de afinação no TrackEditor).
//
// Formatos reais de `\tuning` num Track.headerFragment:
//   - declareTrack:  `\tuning E4 B3 G3 D3 A2 E2`            (sem parênteses)
//   - AlphaTexExporter (imports/materialização):
//       `\tuning (Eb4 Bb3 Gb3 Db3 Ab2 Eb2) {`
//       `  label "Guitar Tune down ½ step"`
//       `}`
//     (parênteses + bloco de label opcional, possivelmente multi-linha)

/** Token de afinação alphaTex: nota (com # ou b opcional) + oitava. Ex.: E2, F#3, Eb4. */
export const TUNING_TOKEN = /^[a-gA-G](#|b)?\d$/;

/**
 * Tokens da `\tuning` atual de um header de trilha (aguda → grave), nos dois
 * formatos acima. null = trilha sem afinação de cordas (piano, percussão,
 * `\tuning piano/none/voice`).
 */
export function tuningTokensFromHeader(
  header: string | null | undefined,
): string[] | null {
  if (!header) return null;
  const paren = header.match(/\\tuning\s*\(\s*([^)]+?)\s*\)/i);
  const bare = paren ? null : header.match(/^\s*\\tuning\s+([^({\r\n]+?)\s*$/im);
  const raw = paren?.[1] ?? bare?.[1];
  if (!raw) return null;
  const tokens = raw.trim().split(/\s+/);
  return tokens.length >= 3 && tokens.every((t) => TUNING_TOKEN.test(t))
    ? tokens
    : null;
}

/**
 * Reescreve (ou insere) a linha `\tuning` de um header de trilha. Se a linha
 * atual abre um bloco `{ label "…" }` (formato do exporter), o bloco sai junto —
 * o rótulo descrevia a afinação antiga.
 */
export function headerWithTuning(header: string, tokens: string[]): string {
  const lines = header.split(/\r?\n/);
  const line = `\\tuning ${tokens.join(" ")}`;
  const idx = lines.findIndex((l) => /^\s*\\tuning\b/i.test(l));
  if (idx < 0) {
    // Sem \tuning ainda: entra depois do \instrument (ou do \track).
    const after = lines.findIndex((l) => /^\s*\\instrument\b/i.test(l));
    lines.splice((after >= 0 ? after : 0) + 1, 0, line);
    return lines.join("\n");
  }
  const opens = (s: string) =>
    (s.match(/\{/g)?.length ?? 0) - (s.match(/\}/g)?.length ?? 0);
  let end = idx;
  let depth = opens(lines[idx]);
  while (depth > 0 && end + 1 < lines.length) {
    end++;
    depth += opens(lines[end]);
  }
  lines.splice(idx, end - idx + 1, line);
  return lines.join("\n");
}

// ── Opções da UI ───────────────────────────────────────────────────────────────

/** Nomes de nota nos valores canônicos do alphaTab (bemóis) — o exporter devolve
 *  estes mesmos nomes, então o select round-tripa limpo. */
export const NOTE_OPTIONS = [
  "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B",
] as const;

const SHARP_TO_FLAT: Record<string, string> = {
  "C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab", "A#": "Bb",
};

/** Separa um token ("Eb4", "f#3") em { note, octave } com a nota normalizada
 *  para o nome canônico (bemol). */
export function splitTuningToken(token: string): { note: string; octave: number } {
  const note = token.slice(0, -1);
  const octave = Number(token.slice(-1));
  const cap = note[0].toUpperCase() + note.slice(1);
  return { note: SHARP_TO_FLAT[cap] ?? cap, octave };
}

export type TuningPreset = { label: string; tokens: string[] };

/** Presets por nº de cordas (aguda → grave), os nomes que o nicho usa. */
export const TUNING_PRESETS: Record<number, TuningPreset[]> = {
  6: [
    { label: "Padrão (E A D G B E)", tokens: ["E4", "B3", "G3", "D3", "A2", "E2"] },
    { label: "Drop D", tokens: ["E4", "B3", "G3", "D3", "A2", "D2"] },
    { label: "Meio tom abaixo (Eb)", tokens: ["Eb4", "Bb3", "Gb3", "Db3", "Ab2", "Eb2"] },
    { label: "Um tom abaixo (D)", tokens: ["D4", "A3", "F3", "C3", "G2", "D2"] },
    { label: "Drop C#", tokens: ["Eb4", "Bb3", "Gb3", "Db3", "Ab2", "Db2"] },
    { label: "Drop C", tokens: ["D4", "A3", "F3", "C3", "G2", "C2"] },
    { label: "DADGAD", tokens: ["D4", "A3", "G3", "D3", "A2", "D2"] },
  ],
  4: [
    { label: "Padrão (E A D G)", tokens: ["G2", "D2", "A1", "E1"] },
    { label: "Drop D", tokens: ["G2", "D2", "A1", "D1"] },
    { label: "Meio tom abaixo (Eb)", tokens: ["Gb2", "Db2", "Ab1", "Eb1"] },
    { label: "Um tom abaixo (D)", tokens: ["F2", "C2", "G1", "D1"] },
  ],
  5: [
    { label: "Padrão (B E A D G)", tokens: ["G2", "D2", "A1", "E1", "B0"] },
  ],
  7: [
    { label: "Padrão (B E A D G B E)", tokens: ["E4", "B3", "G3", "D3", "A2", "E2", "B1"] },
    { label: "Drop A", tokens: ["E4", "B3", "G3", "D3", "A2", "E2", "A1"] },
  ],
};

/** Resumo compacto para o botão: grave → aguda, sem oitava. Ex.: "E A D G B E". */
export function tuningSummary(tokens: string[]): string {
  return tokens
    .slice()
    .reverse()
    .map((t) => splitTuningToken(t).note)
    .join(" ");
}
