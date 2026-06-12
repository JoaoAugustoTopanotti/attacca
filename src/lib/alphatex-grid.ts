// Decompose a comments-annotated alphaTex export into a (track × measure) grid,
// and reassemble it back. PROVEN logic shared by spikes/assemble.ts and the
// materialization service — what we prove and what we ship are the same code.
//
// Pure string processing (no alphaTab dep). The caller uses alphaTab to produce
// the comments-annotated export (AlphaTexExporter, comments=true) and to validate
// the reassembled result (ScoreLoader.loadAlphaTex).
//
// Facts the spike established:
//  - the exporter emits "// Masterbar N Metadata" only when structure changes →
//    split bars by the top-level "|", not by markers; markers only locate the
//    end of a track header;
//  - MULTIPLE VOICES are written as parallel "voice runs" separated by "\voice"
//    (voice 0 implicit, then "\voice" before voice 1, 2, …). A cell = one
//    (track, measure) holding ALL voices of that bar, so we split a track into
//    voice runs, index bars within each run, and TRANSPOSE on reassembly
//    (outer loop = voice, inner loop = measure).

export type GridTrack = {
  header: string[];
  voices: string[][][]; // voices[voiceIndex][barIndex] = token lines
};
export type Grid = { globalHeader: string[]; tracks: GridTrack[] };

/** DB-shaped view: structure shared per measure, multi-voice notes per cell. */
export type NormalizedGrid = {
  globalHeader: string;
  tracks: { headerFragment: string }[];
  measures: { structPrefix: string }[];
  // cell body = the bar's voices joined by a "\voice" line (real alphaTex token).
  cells: { trackIndex: number; measureIndex: number; body: string }[];
};

const isComment = (l: string) => l.trim().startsWith("//");
const isBarSep = (l: string) => l.trim() === "|";
const isVoiceSep = (l: string) => /^\\voice\b/.test(l.trim());
const isBarStartMarker = (t: string) =>
  /^\/\/ (Masterbar \d+ Metadata|Bar \d+ Metadata|Bar \d+ \/ Voice)/.test(t);
const nonEmpty = (l: string) => l.trim() !== "";

// Masterbar-level directives = shared scaffold (Measure.structPrefix). Everything
// else (clef, ks, accidentals, ottava, simile, barlines, notes) stays per cell.
const MASTERBAR_DIRECTIVES = [
  "\\ts",
  "\\tempo",
  "\\section",
  "\\ro",
  "\\rc",
  "\\ae",
  "\\jump",
  "\\beaming",
  "\\tf",
  "\\ac",
  "\\ft",
];

export function isMasterbarLine(line: string): boolean {
  const t = line.trim();
  return MASTERBAR_DIRECTIVES.some(
    (d) => t === d || t.startsWith(d + " ") || t.startsWith(d + "("),
  );
}

/** Parse a comments-annotated alphaTex export into a voice-aware grid. */
export function decompose(annotatedTex: string): Grid {
  const lines = annotatedTex.split(/\r?\n/);
  const globalHeader: string[] = [];
  const tracks: GridTrack[] = [];
  let cur: GridTrack | null = null;
  let mode: "global" | "trackHeader" | "bars" = "global";
  let run: string[][] = []; // bars of the current voice run
  let bar: string[] = [];

  const flushBar = () => {
    run.push(bar);
    bar = [];
  };
  const flushRun = () => {
    flushBar();
    if (cur) cur.voices.push(run);
    run = [];
  };
  const flushTrack = () => {
    if (cur) {
      flushRun();
      tracks.push(cur);
    }
    cur = null;
    run = [];
    bar = [];
  };

  for (const line of lines) {
    const t = line.trim();
    if (/^\\track\b/.test(t)) {
      flushTrack();
      cur = { header: [line], voices: [] };
      mode = "trackHeader";
      continue;
    }
    if (mode === "global") {
      if (!isComment(line)) globalHeader.push(line);
      continue;
    }
    if (mode === "trackHeader") {
      if (isBarStartMarker(t)) {
        mode = "bars"; // first bar of voice 0 begins here
      } else {
        if (!isComment(line)) cur!.header.push(line);
        continue;
      }
    }
    // bars mode
    if (isVoiceSep(line)) {
      flushRun(); // end current voice run, start the next voice
      continue;
    }
    if (isBarSep(line)) {
      flushBar();
      continue;
    }
    if (isComment(line)) continue;
    bar.push(line);
  }
  flushTrack();
  return { globalHeader, tracks };
}

const VOICE_LINE = "\\voice";
const splitVoices = (body: string): string[] =>
  body.split(/\r?\n/).reduce<string[][]>(
    (acc, l) => {
      if (isVoiceSep(l)) acc.push([]);
      else acc[acc.length - 1].push(l);
      return acc;
    },
    [[]],
  ).map((v) => v.filter(nonEmpty).join("\n"));

/** Grid → DB-shaped normalized form (structPrefix from track 0 voice 0). */
export function toNormalized(grid: Grid): NormalizedGrid {
  const t0 = grid.tracks[0];
  const nBars = t0?.voices[0]?.length ?? 0;

  const measures = Array.from({ length: nBars }, (_, m) => ({
    structPrefix: (t0.voices[0][m] ?? []).filter(isMasterbarLine).join("\n"),
  }));
  const tracks = grid.tracks.map((tr) => ({
    headerFragment: tr.header.filter(nonEmpty).join("\n"),
  }));

  const cells: NormalizedGrid["cells"] = [];
  grid.tracks.forEach((tr, trackIndex) => {
    for (let measureIndex = 0; measureIndex < nBars; measureIndex++) {
      // collect this bar across all voice runs; drop masterbar lines (they live
      // on the Measure), keep per-voice bar-meta + notes.
      const voiceBodies = tr.voices.map((voiceRun) =>
        (voiceRun[measureIndex] ?? [])
          .filter((l) => nonEmpty(l) && !isMasterbarLine(l))
          .join("\n"),
      );
      const body = voiceBodies.join(`\n${VOICE_LINE}\n`);
      cells.push({ trackIndex, measureIndex, body });
    }
  });

  return {
    globalHeader: grid.globalHeader.filter(nonEmpty).join("\n"),
    tracks,
    measures,
    cells,
  };
}

/** Rebuild full alphaTex from the normalized form (transposes voices). */
export function assembleFromNormalized(n: NormalizedGrid): string {
  const out: string[] = [];
  if (nonEmpty(n.globalHeader)) out.push(n.globalHeader);
  const byCell = new Map<string, string>();
  for (const c of n.cells) byCell.set(`${c.trackIndex},${c.measureIndex}`, c.body);

  n.tracks.forEach((tr, trackIndex) => {
    if (nonEmpty(tr.headerFragment)) out.push(tr.headerFragment);
    // voice count is constant per track; read it from the first measure's cell.
    const nVoices = splitVoices(byCell.get(`${trackIndex},0`) ?? "").length || 1;
    for (let v = 0; v < nVoices; v++) {
      if (v > 0) out.push(VOICE_LINE);
      for (let m = 0; m < n.measures.length; m++) {
        const voices = splitVoices(byCell.get(`${trackIndex},${m}`) ?? "");
        const struct = v === 0 ? n.measures[m].structPrefix : "";
        const body = voices[v] ?? "";
        const chunk = [struct, body].filter(nonEmpty).join("\n");
        out.push(nonEmpty(chunk) ? chunk : "r.1"); // empty bar → whole rest
        if (m < n.measures.length - 1) out.push("|");
      }
    }
  });
  return out.join("\n");
}

/** Shared-structure reassembly straight from a Grid (= the production path). */
export function assembleSeparated(grid: Grid): string {
  return assembleFromNormalized(toNormalized(grid));
}

/** Per-voice-run flat reassembly (rejoin as-is). Sanity check. */
export function assembleFull(grid: Grid): string {
  const out: string[] = [];
  out.push(...grid.globalHeader.filter(nonEmpty));
  grid.tracks.forEach((tr) => {
    out.push(...tr.header);
    tr.voices.forEach((voiceRun, v) => {
      if (v > 0) out.push(VOICE_LINE);
      voiceRun.forEach((barTokens, m) => {
        const chunk = barTokens.filter(nonEmpty);
        out.push(...(chunk.length ? chunk : ["r.1"]));
        if (m < voiceRun.length - 1) out.push("|");
      });
    });
  });
  return out.join("\n");
}
