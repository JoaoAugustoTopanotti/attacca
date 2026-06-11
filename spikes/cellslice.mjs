// DISPOSABLE SPIKE — not production code.
// M2 de-risking: prove the atomic merge mechanic BEFORE modeling any schema.
//
//   slice (track t, bar j) from a "contributor" score
//   --> swap it into the "base" score at the same (t, j)
//   --> re-emit valid alphaTex (re-imports cleanly)
//
// Verifies: (a) output re-imports without error, (b) the swapped cell now has the
// contributor's notes, (c) every OTHER cell is unchanged.
//
// Run: node spikes/cellslice.mjs [path-to-real.gp]

import { readFileSync } from "node:fs";
import * as alphaTab from "@coderline/alphatab";

const { ScoreLoader } = alphaTab.importer;
const { AlphaTexExporter } = alphaTab.exporter;
const Settings = alphaTab.Settings;

// --- the merge primitive: replace (track t, bar j) in `base` with `contrib`'s ---
function swapCell(base, contrib, t, j) {
  const baseBar = base.tracks[t].staves[0].bars[j];
  const contribBar = contrib.tracks[t].staves[0].bars[j];
  // Move the contributor's voices into the base bar and re-parent them.
  baseBar.voices = contribBar.voices;
  for (let vi = 0; vi < baseBar.voices.length; vi++) {
    const v = baseBar.voices[vi];
    v.bar = baseBar;
    v.index = vi;
    for (const beat of v.beats) beat.voice = v;
  }
  // Recompute derived state (durations, ties, beaming, …) so export is consistent.
  base.finish(new Settings());
}

// fret.string fingerprint of one (track, bar) cell
function cellFrets(score, t, j) {
  const bar = score.tracks[t].staves[0].bars[j];
  return bar.voices
    .flatMap((v) => v.beats)
    .flatMap((b) => (b.isRest ? ["r"] : b.notes.map((n) => `${n.fret}.${n.string}`)))
    .join(" ");
}

// fingerprint EVERY cell so we can prove only the target changed
function gridFingerprint(score) {
  const g = {};
  score.tracks.forEach((track, t) => {
    const bars = track.staves[0].bars;
    bars.forEach((_, j) => {
      g[`${t},${j}`] = cellFrets(score, t, j);
    });
  });
  return g;
}

function reimport(score) {
  const tex = new AlphaTexExporter().exportToString(score);
  let reimported = null;
  let error = null;
  try {
    reimported = ScoreLoader.loadAlphaTex(tex);
  } catch (e) {
    error = e?.message ? e.message.split("\n")[0] : String(e);
  }
  return { tex, reimported, error };
}

// ============================================================
// PART 1 — controlled example (verifiable note-by-note)
// ============================================================
console.log("\n=== PART 1: controlled example ===\n");

const BASE_TEX = `\\title "Slice Proof"
.
\\track "Guitar"
\\tuning E4 B3 G3 D3 A2 E2
:4 0.6 0.6 0.6 0.6 | 1.6 1.6 1.6 1.6 | 2.6 2.6 2.6 2.6 | 3.6 3.6 3.6 3.6
\\track "Bass"
\\tuning G2 D2 A1 E1
:4 0.4 0.4 0.4 0.4 | 1.4 1.4 1.4 1.4 | 2.4 2.4 2.4 2.4 | 3.4 3.4 3.4 3.4
`;

// Contributor reworked the BASS, bar index 1 (the 2nd bar): now 7.4 x4.
const CONTRIB_TEX = `\\title "Slice Proof"
.
\\track "Guitar"
\\tuning E4 B3 G3 D3 A2 E2
:4 0.6 0.6 0.6 0.6 | 1.6 1.6 1.6 1.6 | 2.6 2.6 2.6 2.6 | 3.6 3.6 3.6 3.6
\\track "Bass"
\\tuning G2 D2 A1 E1
:4 0.4 0.4 0.4 0.4 | :8 7.4 7.4 7.4 7.4 7.4 7.4 7.4 7.4 | :4 2.4 2.4 2.4 2.4 | 3.4 3.4 3.4 3.4
`;

const base = ScoreLoader.loadAlphaTex(BASE_TEX);
const contrib = ScoreLoader.loadAlphaTex(CONTRIB_TEX);

const T = 1; // Bass
const J = 1; // 2nd bar
const before = gridFingerprint(base);
const contribCell = cellFrets(contrib, T, J);
console.log(`base   cell (${T},${J}) = "${before[`${T},${J}`]}"`);
console.log(`contrib cell (${T},${J}) = "${contribCell}"`);

swapCell(base, contrib, T, J);

const { tex, reimported, error } = reimport(base);
if (error) {
  console.log(`\n❌ re-emit inválido: ${error}`);
  process.exit(1);
}
const after = gridFingerprint(reimported);

const swappedNow = after[`${T},${J}`];
const swapOk = swappedNow === contribCell;
console.log(`\nre-emit re-importa: OK (${reimported.tracks.length} trilhas)`);
console.log(`cell (${T},${J}) depois = "${swappedNow}"  -> swap ${swapOk ? "OK ✅" : "FALHOU ❌"}`);

// every other cell must be identical to the base's original fingerprint
let collateral = 0;
for (const key of Object.keys(before)) {
  if (key === `${T},${J}`) continue;
  if (after[key] !== before[key]) {
    collateral++;
    console.log(`  ⚠ célula alterada indevidamente ${key}: "${before[key]}" -> "${after[key]}"`);
  }
}
console.log(`outras células intactas: ${collateral === 0 ? "OK ✅" : `${collateral} alteradas ❌`}`);

const part1Pass = swapOk && collateral === 0 && !error;
console.log(`\nPART 1: ${part1Pass ? "PASSOU ✅" : "FALHOU ❌"}`);

// ============================================================
// PART 2 — real-world scale (Stairway .gp), if provided
// ============================================================
const realPath = process.argv[2];
if (realPath) {
  console.log("\n=== PART 2: real .gp (escala real) ===\n");
  // Compare only NOTE tokens (ignore rests) — rest runs get normalized on export
  // (documented in ADR 0001); that's not a content loss.
  const notesOnly = (s) => s.split(" ").filter((tok) => tok !== "r").join(" ");

  const real2 = ScoreLoader.loadScoreFromBytes(new Uint8Array(readFileSync(realPath)));
  const contrib2 = ScoreLoader.loadScoreFromBytes(new Uint8Array(readFileSync(realPath)));

  // Find an instrumental track and two DIFFERENT note-bearing bars (src != dst).
  let t2 = -1,
    srcJ = -1,
    dstJ = -1;
  for (let t = 0; t < real2.tracks.length && t2 < 0; t++) {
    const bars = real2.tracks[t].staves[0].bars;
    if (bars.length < 40) continue;
    const withNotes = [];
    for (let j = 0; j < bars.length; j++) {
      if (notesOnly(cellFrets(real2, t, j)).length > 0) withNotes.push(j);
    }
    // pick two whose note content differs
    for (let a = 0; a < withNotes.length && t2 < 0; a++) {
      for (let b = a + 1; b < withNotes.length; b++) {
        if (
          notesOnly(cellFrets(contrib2, t, withNotes[a])) !==
          notesOnly(cellFrets(real2, t, withNotes[b]))
        ) {
          t2 = t;
          srcJ = withNotes[a];
          dstJ = withNotes[b];
          break;
        }
      }
    }
  }

  const baseGridBefore = gridFingerprint(real2);
  const srcContent = notesOnly(cellFrets(contrib2, t2, srcJ));
  const dstBefore = notesOnly(cellFrets(real2, t2, dstJ));

  // graft contrib2's bar srcJ into real2's bar dstJ
  const dstBar = real2.tracks[t2].staves[0].bars[dstJ];
  const srcBar = contrib2.tracks[t2].staves[0].bars[srcJ];
  dstBar.voices = srcBar.voices;
  dstBar.voices.forEach((v, vi) => {
    v.bar = dstBar;
    v.index = vi;
    v.beats.forEach((b) => (b.voice = v));
  });
  real2.finish(new Settings());

  const r = reimport(real2);
  if (r.error) {
    console.log(`❌ re-emit inválido (real): ${r.error}`);
  } else {
    const dstAfter = notesOnly(cellFrets(r.reimported, t2, dstJ));
    console.log(`trilha ${t2} (${real2.tracks[t2].name}) — enxerto bar ${srcJ} -> bar ${dstJ}`);
    console.log(`destino ANTES (notas) = "${dstBefore.slice(0, 70)}"`);
    console.log(`fonte         (notas) = "${srcContent.slice(0, 70)}"`);
    console.log(`destino DEPOIS(notas) = "${dstAfter.slice(0, 70)}"`);
    console.log(`re-importa: OK (${r.reimported.tracks.length} trilhas, ${r.reimported.masterBars.length} compassos)`);

    const swapOk = dstAfter === srcContent && dstAfter !== dstBefore;

    // collateral check: every other cell's NOTE content unchanged
    const afterGrid = gridFingerprint(r.reimported);
    let collateral = 0;
    for (const key of Object.keys(baseGridBefore)) {
      if (key === `${t2},${dstJ}`) continue;
      if (notesOnly(afterGrid[key] ?? "") !== notesOnly(baseGridBefore[key])) collateral++;
    }
    console.log(`swap aplicado: ${swapOk ? "OK ✅" : "FALHOU ❌"}`);
    console.log(`outras células (notas) intactas: ${collateral === 0 ? "OK ✅" : `${collateral} alteradas ❌`}`);
    console.log(`\nPART 2: ${swapOk && collateral === 0 ? "PASSOU ✅" : "FALHOU ❌"}`);
  }
}

console.log("\n(ok) spike concluído.\n");
