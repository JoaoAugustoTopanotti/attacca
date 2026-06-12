// DISPOSABLE SPIKE — not production code.
// M2 cell-schema de-risk WITH structural fidelity (notes are necessary but not
// sufficient). Two parts:
//   PART A: does the alphaTex FORMAT round-trip preserve structure?
//   PART B: does DECOMPOSE -> REASSEMBLE (cells-as-truth) preserve notes AND
//           structure? Decomposition uses the exporter's comment markers
//           (comments=true), which delimit masterbar metadata / bar metadata /
//           voice contents — so we split reliably, no fragile parser.
//
// Mitigation under test (per review): each measure's structural prefix is an
// OPAQUE alphaTex fragment (shared, from the masterbar), notes are a per-cell
// fragment. Reassembly = sharedStruct[measure] + barMeta[track][measure] +
// notes[track][measure], per track.
//
// Run: node spikes/assemble.mjs [path-to-.gp]

import { readFileSync } from "node:fs";
import * as alphaTab from "@coderline/alphatab";

const { ScoreLoader } = alphaTab.importer;
const { AlphaTexExporter } = alphaTab.exporter;

// ---------------- fingerprints ----------------
function noteFingerprint(score) {
  let notes = 0;
  const tokens = [];
  for (const t of score.tracks)
    for (const sf of t.staves)
      for (const b of sf.bars)
        for (const v of b.voices)
          for (const be of v.beats)
            for (const n of be.notes) {
              notes++;
              tokens.push(`${n.fret}.${n.string}`);
            }
  return { notes, sig: tokens.join(" ") };
}
function structFingerprint(score) {
  const mb = score.masterBars.map((m) => ({
    ts: `${m.timeSignatureNumerator}/${m.timeSignatureDenominator}`,
    key: `${m.keySignature}/${m.keySignatureType}`,
    repStart: !!m.isRepeatStart,
    repEnd: !!m.isRepeatEnd,
    repCount: m.repeatCount,
    altEnd: m.alternateEndings | 0,
    section: m.section ? `${m.section.marker ?? ""}|${m.section.text ?? ""}` : "",
    directions: m.directions ? [...m.directions].sort((a, b) => a - b).join(",") : "",
    tempo: (m.tempoAutomations ?? []).map((a) => a.value).join(","),
  }));
  // per (track,bar): clef + right barline style (the real barline, not the
  // derived isDoubleBar flag)
  const bars = [];
  score.tracks.forEach((t, ti) =>
    t.staves[0].bars.forEach((b, bi) =>
      bars.push(`${ti},${bi}:clef${b.clef}/${b.clefOttava}:bl${b.barLineRight}`),
    ),
  );
  return { initialTempo: score.tempo, mb, bars };
}
function compareStruct(a, b) {
  const fieldLoss = {};
  const issues = [];
  const bump = (f, detail) => {
    fieldLoss[f] = (fieldLoss[f] ?? 0) + 1;
    if (fieldLoss[f] <= 3 && detail) issues.push(detail);
  };
  if (a.initialTempo !== b.initialTempo) bump("initialTempo", `tempo ${a.initialTempo}->${b.initialTempo}`);
  if (a.mb.length !== b.mb.length) bump("mbCount", `mb count ${a.mb.length}->${b.mb.length}`);
  const fields = ["ts", "key", "repStart", "repEnd", "repCount", "altEnd", "section", "directions", "tempo"];
  for (let i = 0; i < Math.min(a.mb.length, b.mb.length); i++)
    for (const f of fields)
      if (String(a.mb[i][f]) !== String(b.mb[i]?.[f]))
        bump(f, `mb#${i}.${f}: ${JSON.stringify(a.mb[i][f])}->${JSON.stringify(b.mb[i]?.[f])}`);
  for (let i = 0; i < Math.min(a.bars.length, b.bars.length); i++)
    if (a.bars[i] !== b.bars[i]) bump("clef/barline", `${a.bars[i]} -> ${b.bars[i]}`);
  return { fieldLoss, issues };
}
function lossSummary(fl) {
  const k = Object.keys(fl);
  return k.length === 0 ? "nenhuma ✅" : k.map((x) => `${x}:${fl[x]}`).join("  ");
}

// ---------------- decomposition via comment markers ----------------
const isComment = (l) => l.trim().startsWith("//");
const isBarSep = (l) => l.trim() === "|";

function exportWithComments(score) {
  const s = new alphaTab.Settings();
  s.exporter.comments = true;
  return new AlphaTexExporter().exportToString(score, s);
}

// Decompose using comment markers ONLY to find the track-header boundary, then
// split each track's body purely by the "|" bar separators. Each cell = the
// full token stream of one (track, bar): its structure tokens (\ts, \ks, \ro,
// \ae, \jump, \barLineRight, ...) AND its notes, together. Robust: structure
// can't be misattributed because it stays inside its own "|" segment.
function decompose(score) {
  const lines = exportWithComments(score).split(/\r?\n/);
  const globalHeader = [];
  const tracks = [];
  let cur = null;
  let mode = "global";
  let bar = []; // token lines of the current bar

  const isBarStartMarker = (t) =>
    /^\/\/ (Masterbar \d+ Metadata|Bar \d+ Metadata|Bar \d+ \/ Voice)/.test(t);

  const flushBar = () => {
    if (cur) cur.bars.push(bar);
    bar = [];
  };
  const flushTrack = () => {
    if (cur) {
      flushBar();
      tracks.push(cur);
    }
    cur = null;
    bar = [];
  };

  for (const line of lines) {
    const t = line.trim();
    if (/^\\track\b/.test(t)) {
      flushTrack();
      cur = { header: [line], bars: [] };
      mode = "trackHeader";
      continue;
    }
    if (mode === "global") {
      if (!isComment(line)) globalHeader.push(line);
      continue;
    }
    if (mode === "trackHeader") {
      if (isBarStartMarker(t)) {
        mode = "bars"; // first bar begins here
      } else {
        if (!isComment(line)) cur.header.push(line);
        continue;
      }
    }
    // bars mode
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

// Rebuild (variant 1): global header + per track (header + bars joined by "|").
// Each cell carries its own full structure+notes. Proves per-cell fragments
// reassemble losslessly.
function reassemble(grid) {
  const out = [...grid.globalHeader.filter((l) => l.trim() !== "")];
  grid.tracks.forEach((tr) => {
    out.push(...tr.header);
    tr.bars.forEach((barTokens, m) => {
      const chunk = barTokens.filter((l) => l.trim() !== "");
      out.push(...(chunk.length ? chunk : ["r.1"])); // empty bar -> whole rest
      if (m < tr.bars.length - 1) out.push("|");
    });
  });
  return out.join("\n");
}

// Masterbar-level directives = shared scaffold (go on Measure). Everything else
// (clef, ks, accidentals, ottava, simile, barlines, notes) stays per-cell.
const MASTERBAR_DIRECTIVES = ["\\ts", "\\tempo", "\\section", "\\ro", "\\rc", "\\ae", "\\jump", "\\beaming", "\\tf", "\\ac", "\\ft"];
const isMasterbarLine = (l) => {
  const t = l.trim();
  return MASTERBAR_DIRECTIVES.some((d) => t === d || t.startsWith(d + " ") || t.startsWith(d + "("));
};

// Rebuild (variant 2, the proposed SCHEMA): masterbar structure is an opaque
// fragment SHARED per measure (taken from track 0), notes/bar-meta are per cell.
// Proves the "structPrefix on Measure + notes on Cell" design is lossless.
function reassembleSeparated(grid) {
  const out = [...grid.globalHeader.filter((l) => l.trim() !== "")];
  const t0 = grid.tracks[0];
  // shared structural prefix per measure (from track 0)
  const structPrefix = t0.bars.map((bar) => bar.filter(isMasterbarLine));
  grid.tracks.forEach((tr) => {
    out.push(...tr.header);
    tr.bars.forEach((barTokens, m) => {
      const cellBody = barTokens.filter((l) => l.trim() !== "" && !isMasterbarLine(l));
      const chunk = [...(structPrefix[m] ?? []), ...cellBody];
      out.push(...(chunk.length ? chunk : ["r.1"]));
      if (m < tr.bars.length - 1) out.push("|");
    });
  });
  return out.join("\n");
}

// ============================================================
function run(label, score1) {
  console.log(`\n========== ${label} ==========`);
  const n1 = noteFingerprint(score1);
  const s1 = structFingerprint(score1);
  console.log(`origem: ${score1.tracks.length} trilhas, ${score1.masterBars.length} compassos, ${n1.notes} notas`);

  // PART A — whole-doc format round-trip
  const texA = new AlphaTexExporter().exportToString(score1);
  const A = ScoreLoader.loadAlphaTex(texA);
  const cmpA = compareStruct(s1, structFingerprint(A));
  const notesA = noteFingerprint(A).sig === n1.sig;
  console.log(`PART A (formato): notas ${notesA ? "OK" : "❌"} | estrutura ${lossSummary(cmpA.fieldLoss)}`);
  cmpA.issues.slice(0, 5).forEach((x) => console.log("    ", x));

  // PART B — decompose -> reassemble (cells as truth)
  let B,
    err = null;
  try {
    B = ScoreLoader.loadAlphaTex(reassemble(decompose(score1)));
  } catch (e) {
    err = e?.message?.split("\n")[0] ?? String(e);
  }
  if (err) {
    console.log(`PART B (remontagem): ❌ não re-importa: ${err}`);
    return;
  }
  const cmpB = compareStruct(s1, structFingerprint(B));
  const notesB = noteFingerprint(B).sig === n1.sig;
  console.log(`PART B (cell = fragmento completo): notas ${notesB ? "OK ✅" : "❌"} | estrutura ${lossSummary(cmpB.fieldLoss)}`);
  cmpB.issues.slice(0, 6).forEach((x) => console.log("    ", x));

  // PART C — separated schema (structPrefix shared on Measure + notes per cell)
  let C,
    errC = null;
  try {
    C = ScoreLoader.loadAlphaTex(reassembleSeparated(decompose(score1)));
  } catch (e) {
    errC = e?.message?.split("\n")[0] ?? String(e);
  }
  let passC = false;
  if (errC) {
    console.log(`PART C (structPrefix na Measure): ❌ não re-importa: ${errC}`);
  } else {
    const cmpC = compareStruct(s1, structFingerprint(C));
    const notesC = noteFingerprint(C).sig === n1.sig;
    passC = notesC && Object.keys(cmpC.fieldLoss).length === 0;
    console.log(`PART C (structPrefix na Measure): notas ${notesC ? "OK ✅" : "❌"} | estrutura ${lossSummary(cmpC.fieldLoss)}`);
    cmpC.issues.slice(0, 6).forEach((x) => console.log("    ", x));
  }

  const passB = notesB && Object.keys(cmpB.fieldLoss).length === 0;
  console.log(`=> ${label}: B ${passB ? "✅" : "❌"} | C ${passC ? "✅" : "❌"}`);
}

// controlled, structure-rich score
const CONTROLLED = `\\title "Struct Test"
\\tempo 120
.
\\track "Guitar"
\\tuning E4 B3 G3 D3 A2 E2
\\clef G2 \\ks C
:4 0.6 0.6 0.6 0.6 |
\\section "A" \\tempo 90 :4 1.6 1.6 1.6 1.6 |
\\ro :4 2.6 2.6 2.6 2.6 |
\\ae 1 :4 3.6 3.6 3.6 3.6 \\rc 2 |
\\ae 2 :4 5.6 5.6 5.6 5.6 |
\\ts 3 4 \\ks D :4 0.5 0.5 0.5 |
\\clef F4 \\jump Segno :4 1.5 1.5 1.5 |
\\jump Fine :4 2.5 2.5 2.5 |
\\jump DaCapo :4 3.5 3.5 3.5 |
\\track "Bass"
\\tuning G2 D2 A1 E1
:4 0.4 0.4 0.4 0.4 | :4 1.4 1.4 1.4 1.4 | :4 2.4 2.4 2.4 2.4 | :4 3.4 3.4 3.4 3.4 | :4 5.4 5.4 5.4 5.4 | \\ts 3 4 :4 0.3 0.3 0.3 | :4 1.3 1.3 1.3 | :4 2.3 2.3 2.3 | :4 3.3 3.3 3.3
`;
run("CONTROLADO (estrutura rica)", ScoreLoader.loadAlphaTex(CONTROLLED));

const realPath = process.argv[2];
if (realPath) {
  run("STAIRWAY (.gp real)", ScoreLoader.loadScoreFromBytes(new Uint8Array(readFileSync(realPath))));
}

console.log("\n(ok) spike concluído.\n");
