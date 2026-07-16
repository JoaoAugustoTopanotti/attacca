// Drum/percussion grid model — the data behind the visual step-sequencer editor
// (DrumGridEditor). Percussion doesn't fit the string×fret tablature model, so
// instead we lay out rows = drum pieces (kick, snare, hi-hat…) × columns = time
// steps, the way a drum machine / GP drum view works.
//
// Pure string/data processing (no alphaTab dep). The caller validates every
// reassembled document through alphaTab.
//
// Model: a bar is a list of BEATS (one per time-signature numerator unit). Each
// beat is either straight (subdivided into power-of-two cells) or a TRIPLET
// (subdivided into 3-against-2 cells) — so "straight hats on 1-3, triplet fill
// on 4" is representable, which a single fixed grid can't do. Each cell holds a
// set of hits; each hit can carry a modifier (accent, ghost, or flam/grace).
//
// alphaTex percussion notation: notes are MIDI numbers or quoted articulation
// names; accent `{ac}`, ghost `{g}`, grace/flam `{gr}`, tuplet `{tu 3}`.

export type DrumPiece = { midi: number; label: string; short: string };

// Ordered top→bottom the way a drum staff/tab reads (cymbals up, kick down).
export const DRUM_PIECES: DrumPiece[] = [
  { midi: 49, label: "Prato de ataque", short: "CC" },
  { midi: 57, label: "Prato de ataque 2", short: "CC2" },
  { midi: 55, label: "Splash", short: "SP" },
  { midi: 52, label: "China", short: "CN" },
  { midi: 51, label: "Prato de condução", short: "RD" },
  { midi: 53, label: "Condução (sino)", short: "RB" },
  { midi: 46, label: "Chimbal aberto", short: "HO" },
  { midi: 42, label: "Chimbal fechado", short: "HH" },
  { midi: 44, label: "Chimbal (pedal)", short: "HP" },
  { midi: 50, label: "Tom 1 (alto)", short: "T1" },
  { midi: 48, label: "Tom 2", short: "T2" },
  { midi: 47, label: "Tom 3", short: "T3" },
  { midi: 45, label: "Tom 4", short: "T4" },
  { midi: 43, label: "Surdo/tom grave", short: "T5" },
  { midi: 41, label: "Surdo grave", short: "T6" },
  { midi: 38, label: "Caixa", short: "CX" },
  { midi: 40, label: "Caixa elétrica", short: "CXe" },
  { midi: 37, label: "Caixa (aro)", short: "AR" },
  { midi: 39, label: "Palma", short: "PL" },
  { midi: 54, label: "Tamborim", short: "TM" },
  { midi: 56, label: "Cowbell", short: "CB" },
  { midi: 36, label: "Bumbo", short: "BD" },
  { midi: 35, label: "Bumbo 2", short: "BD2" },
];

/** Pieces shown by default in a fresh grid (the common rock kit, top→bottom). */
export const DEFAULT_LANES = [49, 51, 46, 42, 48, 45, 43, 38, 36];

export const PIECE_BY_MIDI = new Map(DRUM_PIECES.map((p) => [p.midi, p]));

// Reverse of the articulation names the AlphaTexExporter emits, so an imported
// (or previously text-edited) drum track round-trips into the grid.
const NAME_TO_MIDI: Record<string, number> = {
  "Kick (hit)": 35,
  "Kick (hit) 2": 36,
  "Snare (side stick) 3": 37,
  "Snare (hit) 2": 38,
  "Hand Clap (hit)": 39,
  "Electric Snare (hit)": 40,
  "Low Floor Tom (hit)": 41,
  "Hi-Hat (closed)": 42,
  "Very Low Tom (hit)": 43,
  "Pedal Hi-Hat (hit)": 44,
  "Low Tom (hit)": 45,
  "Hi-Hat (open)": 46,
  "Mid Tom (hit)": 47,
  "High Tom (hit)": 48,
  "Crash high (hit)": 49,
  "High Floor Tom (hit)": 50,
  "Ride (middle)": 51,
  "China (hit)": 52,
  "Ride (bell)": 53,
  "Tambourine (hit)": 54,
  "Splash (hit)": 55,
  "Cowbell medium (hit)": 56,
  "Crash medium (hit)": 57,
  "Vibraslap (hit)": 58,
  "Ride (edge) 2": 59,
};

export type DrumResolution = 4 | 8 | 16 | 32;
export const RESOLUTIONS: { value: DrumResolution; label: string }[] = [
  { value: 4, label: "1/4" },
  { value: 8, label: "1/8" },
  { value: 16, label: "1/16" },
  { value: 32, label: "1/32" },
];

// One hit's modifier. accent/ghost are mutually exclusive; flam is independent.
export type NoteMod = { accent?: boolean; ghost?: boolean; flam?: boolean };
export type Cell = Map<number, NoteMod>; // midi → modifier (present key = a hit)
export type Beat = { triplet: boolean; cells: Cell[] };
// prefix = leading directive lines (\clef, \accidentals, \ks… — the exporter
// emits them on a materialized track's first bar). The grid doesn't model them,
// but it must not LOSE them — they're kept opaque and re-emitted on serialize.
export type Bar = { beats: Beat[]; parseOk: boolean; prefix: string };

const TPW = 3840; // ticks per whole note (divisible by 2·3·… — supports triplets)

/** Straight cells in a beat: how many `res`-value notes fit one `1/tsDen` beat. */
export function straightCells(res: DrumResolution, tsDen: number): number {
  return res / tsDen;
}
/** Triplet cells in a beat = 3-against-2 of the straight subdivision. */
export function tripletCells(res: DrumResolution, tsDen: number): number {
  return (straightCells(res, tsDen) * 3) / 2;
}
/** A beat can be a triplet only if its straight subdivision is even (≥ 1/8). */
export function canTriplet(res: DrumResolution, tsDen: number): boolean {
  const s = straightCells(res, tsDen);
  return s >= 2 && s % 2 === 0;
}
export function cellsInBeat(
  triplet: boolean,
  res: DrumResolution,
  tsDen: number,
): number {
  return triplet ? tripletCells(res, tsDen) : straightCells(res, tsDen);
}

/** Whether a resolution tiles a bar into whole cells (used to enable/disable it). */
export function resolutionFits(
  tsNum: number,
  tsDen: number,
  res: DrumResolution,
): boolean {
  const s = straightCells(res, tsDen);
  return Number.isInteger(s) && s >= 1 && Number.isInteger(tsNum) && tsNum >= 1;
}

function emptyBeat(triplet: boolean, res: DrumResolution, tsDen: number): Beat {
  const n = cellsInBeat(triplet, res, tsDen);
  return { triplet, cells: Array.from({ length: n }, () => new Map()) };
}
export function emptyBar(tsNum: number, res: DrumResolution, tsDen: number): Bar {
  return {
    beats: Array.from({ length: tsNum }, () => emptyBeat(false, res, tsDen)),
    parseOk: true,
    prefix: "",
  };
}

// ── Tokenizing ───────────────────────────────────────────────────────────────

// Split alphaTex into top-level whitespace-separated tokens, respecting quotes
// ("Kick (hit) 2" is ONE token) and paren/brace groups ("(a b)", "{...}").
function splitTokens(tex: string): string[] {
  const tokens: string[] = [];
  let cur = "";
  let depth = 0;
  let inQuote = false;
  for (const ch of tex) {
    if (ch === '"') {
      inQuote = !inQuote;
      cur += ch;
      continue;
    }
    if (inQuote) {
      cur += ch;
      continue;
    }
    if (ch === "(" || ch === "{") depth++;
    else if (ch === ")" || ch === "}") depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) tokens.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur) tokens.push(cur);
  return tokens;
}

// One note inside a chord (or a bare note): "36", "36{ac}", '"Snare (hit) 2"{g}'.
function parseNoteToken(s: string): { midi: number; mod: NoteMod } | null {
  let rest = s;
  let midi: number | null = null;
  const numM = rest.match(/^(\d+)/);
  if (numM) {
    midi = Number(numM[1]);
    rest = rest.slice(numM[1].length);
  } else {
    const nameM = rest.match(/^"([^"]+)"/);
    if (nameM && NAME_TO_MIDI[nameM[1]] != null) {
      midi = NAME_TO_MIDI[nameM[1]];
      rest = rest.slice(nameM[0].length);
    }
  }
  if (midi == null) return null;
  const mod: NoteMod = {};
  const brace = rest.match(/\{([^}]*)\}/);
  if (brace) {
    const props = brace[1].split(/\s+/);
    if (props.includes("ac") || props.includes("hac")) mod.accent = true;
    if (props.includes("g")) mod.ghost = true;
  }
  return { midi, mod };
}

type Event = {
  ticks: number;
  triplet: boolean;
  rest: boolean;
  pieces: { midi: number; mod: NoteMod }[];
  grace: boolean;
};

// Parse one beat/rest/grace token into an Event (null → not griddable).
function parseBeatToken(tok: string, runDur: number | null): Event | null {
  let notePart: string;
  let after: string;
  if (tok.startsWith("(")) {
    const close = tok.lastIndexOf(")");
    if (close < 0) return null;
    notePart = tok.slice(1, close);
    after = tok.slice(close + 1);
  } else if (/^r\b|^r[.{]|^r$/i.test(tok)) {
    notePart = "r";
    after = tok.slice(1);
  } else {
    // bare single note possibly with ".dur" / "{...}"
    const m = tok.match(/^((?:\d+|"[^"]+")(?:\{[^}]*\})?)/);
    if (!m) return null;
    notePart = m[1];
    after = tok.slice(m[1].length);
  }
  const durM = after.match(/^\.(\d+)/);
  const dur = durM ? Number(durM[1]) : runDur;
  if (!dur) return null;
  const beatBrace = after.match(/\{([^}]*)\}/);
  const props = beatBrace ? beatBrace[1].split(/\s+/) : [];
  const triplet = props.includes("tu");
  const grace = props.includes("gr");
  const dotted = props.includes("d") || props.includes("dd");
  if (dotted) return null; // dotted rhythms aren't gridded (→ text)

  let ticks = TPW / dur;
  if (triplet) ticks = (ticks * 2) / 3;

  const rest = notePart === "r";
  const pieces: { midi: number; mod: NoteMod }[] = [];
  if (!rest) {
    for (const p of splitTokens(notePart)) {
      const n = parseNoteToken(p);
      if (!n) return null;
      pieces.push(n);
    }
    if (pieces.length === 0) return null;
  }
  return { ticks, triplet, rest, pieces, grace };
}

/** Parse a bar's percussion alphaTex into the beat grid. On anything it can't
 *  model (dotted, mixed subdivision inside a beat, unknown tokens) parseOk=false
 *  and the editor shows the text view. */
export function parseBar(
  tex: string,
  tsNum: number,
  tsDen: number,
  res: DrumResolution,
): Bar {
  const fail: Bar = { beats: [], parseOk: false, prefix: "" };

  // Leading directive lines (\clef, \accidentals auto, \ks c…) are preserved
  // opaquely as the bar's prefix. A \voice line means a multi-voice cell — the
  // grid can't model parallel voices, so the whole bar falls to text mode.
  const lines = tex.split(/\r?\n/);
  const prefixLines: string[] = [];
  let firstContent = 0;
  for (; firstContent < lines.length; firstContent++) {
    const lt = lines[firstContent].trim();
    if (lt === "") continue;
    if (!lt.startsWith("\\")) break;
    if (/^\\voice\b/.test(lt)) return fail;
    prefixLines.push(lt);
  }
  const prefix = prefixLines.join("\n");
  const body = lines.slice(firstContent).join("\n").trim();
  if (body === "") return { ...emptyBar(tsNum, res, tsDen), prefix };

  const tokens = splitTokens(body);
  const events: (Event & { start: number })[] = [];
  let runDur: number | null = null;
  let t = 0;
  let pendingGrace: { midi: number; mod: NoteMod }[] = [];
  for (const tok of tokens) {
    const dm = tok.match(/^:(\d+)$/);
    if (dm) {
      runDur = Number(dm[1]);
      continue;
    }
    if (tok === "|") continue;
    // Directive mid-body (\voice, \clef…): not griddable — fail cleanly instead
    // of skipping the token and mis-parsing its arguments as notes.
    if (tok.startsWith("\\")) return fail;
    const ev = parseBeatToken(tok, runDur);
    if (!ev) return fail;
    if (ev.grace) {
      pendingGrace.push(...ev.pieces);
      continue; // grace consumes no bar time
    }
    // attach any pending grace pieces as flams on matching hits
    if (pendingGrace.length && !ev.rest) {
      for (const g of pendingGrace) {
        const hit = ev.pieces.find((p) => p.midi === g.midi) ?? ev.pieces[0];
        if (hit) hit.mod = { ...hit.mod, flam: true };
      }
    }
    pendingGrace = [];
    events.push({ ...ev, start: t });
    t += ev.ticks;
  }

  const beatTicks = TPW / tsDen;
  if (t !== beatTicks * tsNum) return fail; // doesn't fill bar

  // Segment events into beats, choosing straight/triplet per beat.
  const beats: Beat[] = [];
  for (let b = 0; b < tsNum; b++) {
    const beatStart = b * beatTicks;
    const inBeat = events.filter(
      (e) => e.start >= beatStart && e.start < beatStart + beatTicks,
    );
    const triplet = inBeat.some((e) => e.triplet);
    if (triplet && !canTriplet(res, tsDen)) return fail;
    const nCells = cellsInBeat(triplet, res, tsDen);
    const cellTicks = beatTicks / nCells;
    const cells: Cell[] = Array.from({ length: nCells }, () => new Map());
    for (const e of inBeat) {
      const off = e.start - beatStart;
      if (off % cellTicks !== 0) return fail;
      const idx = off / cellTicks;
      if (idx >= nCells) return fail;
      if (!e.rest) for (const p of e.pieces) cells[idx].set(p.midi, p.mod);
    }
    beats.push({ triplet, cells });
  }
  return { beats, parseOk: true, prefix };
}

// ── Serializing ────────────────────────────────────────────────────────────

function modProps(mod: NoteMod): string {
  if (mod.accent) return "{ac}";
  if (mod.ghost) return "{g}";
  return "";
}

function serializeCell(cell: Cell, res: DrumResolution, triplet: boolean): string {
  const tu = triplet ? "{tu 3}" : "";
  if (cell.size === 0) return `r.${res}${tu}`;
  const midis = [...cell.keys()].sort((a, b) => a - b);
  const notes = midis.map((m) => `${m}${modProps(cell.get(m)!)}`);
  return `(${notes.join(" ")}).${res}${tu}`;
}

function serializeBeat(beat: Beat, res: DrumResolution): string {
  const out: string[] = [];
  for (const cell of beat.cells) {
    // Flam = a grace note of the same piece(s) just before the hit.
    const flams = [...cell.keys()].filter((m) => cell.get(m)!.flam).sort((a, b) => a - b);
    if (flams.length) out.push(`(${flams.join(" ")}).${res}{gr}`);
    out.push(serializeCell(cell, res, beat.triplet));
  }
  return out.join(" ");
}

function barHasHits(bar: Bar): boolean {
  return bar.beats.some((b) => b.cells.some((c) => c.size > 0));
}

/** Serialize a bar's grid back to percussion alphaTex. Empty bar → "" (so an
 *  untouched declared slot stays empty and isn't counted as edited); a bar
 *  carrying opaque directives keeps them (with a whole-bar rest if hitless —
 *  same convention the assembler uses for empty cells). */
export function serializeBar(bar: Bar, res: DrumResolution): string {
  if (!barHasHits(bar)) return bar.prefix ? `${bar.prefix}\nr.1` : "";
  const body = bar.beats.map((b) => serializeBeat(b, res)).join(" ");
  return bar.prefix ? `${bar.prefix}\n${body}` : body;
}

/** Which MIDI pieces appear anywhere in a set of bars (to decide extra lanes). */
export function midisInBars(bars: Bar[]): Set<number> {
  const s = new Set<number>();
  for (const bar of bars)
    for (const beat of bar.beats)
      for (const cell of beat.cells) for (const m of cell.keys()) s.add(m);
  return s;
}

/** Deep-clone a bar (cells are Maps — spread isn't enough). Clipboard/undo. */
export function cloneBar(bar: Bar): Bar {
  return {
    parseOk: bar.parseOk,
    prefix: bar.prefix,
    beats: bar.beats.map((b) => ({
      triplet: b.triplet,
      cells: b.cells.map((c) => new Map(c)),
    })),
  };
}

/** Fit a copied bar into a target measure's shape (paste across time
 *  signatures/resolutions): hits are kept beat-by-beat and remapped to the
 *  target subdivision; missing beats come up empty, extra beats are dropped.
 *  prefix is "" — the caller keeps the TARGET bar's own prefix (directives are
 *  positional, they don't travel with copied content). */
export function conformBar(
  src: Bar,
  tsNum: number,
  tsDen: number,
  res: DrumResolution,
): Bar {
  const out = emptyBar(tsNum, res, tsDen);
  for (let b = 0; b < Math.min(tsNum, src.beats.length); b++) {
    const triplet = src.beats[b].triplet && canTriplet(res, tsDen);
    out.beats[b] = remapBeat(src.beats[b], triplet, res, tsDen);
  }
  return out;
}

/** True iff every hit in the beat lands EXACTLY on the new subdivision — i.e.
 *  remapBeat would move nothing. Lets the editor warn before a lossy change. */
export function remapBeatIsLossless(
  beat: Beat,
  triplet: boolean,
  res: DrumResolution,
  tsDen: number,
): boolean {
  const nCells = cellsInBeat(triplet, res, tsDen);
  const old = beat.cells.length;
  return beat.cells.every((c, i) => c.size === 0 || (i * nCells) % old === 0);
}

/** Remap a beat's hits proportionally when its subdivision changes (resolution
 *  change or straight↔triplet toggle). */
export function remapBeat(
  beat: Beat,
  triplet: boolean,
  res: DrumResolution,
  tsDen: number,
): Beat {
  const nCells = cellsInBeat(triplet, res, tsDen);
  const cells: Cell[] = Array.from({ length: nCells }, () => new Map());
  const old = beat.cells.length;
  beat.cells.forEach((c, i) => {
    if (c.size === 0) return;
    const dst = Math.min(nCells - 1, Math.round((i / old) * nCells));
    for (const [m, mod] of c) cells[dst].set(m, mod);
  });
  return { triplet, cells };
}
