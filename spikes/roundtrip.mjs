// DISPOSABLE SPIKE — not production code.
// Round-trip experiment for the canonical-format decision (Design Spike B).
//
//   .gp --(alphaTab import)--> model --(AlphaTexExporter)--> alphaTex
//        --(ScoreLoader.loadAlphaTex)--> model'  ... compare model vs model'
//
// We measure, objectively:
//   1) fidelity: structural counts before/after (tracks, measures, beats, notes, effects)
//   2) cell addressing: how trivial is (track, measure) lookup in the model/alphaTex
//   3) round-trip friction: what importer/exporter is needed
//
// Run: node spikes/roundtrip.mjs <path-to-.gp>

import { readFileSync, writeFileSync } from "node:fs";
import * as alphaTab from "@coderline/alphatab";

const gpPath = process.argv[2];
if (!gpPath) {
  console.error("usage: node spikes/roundtrip.mjs <path-to-.gp>");
  process.exit(1);
}

const { ScoreLoader } = alphaTab.importer;
const { AlphaTexExporter } = alphaTab.exporter;

// --- collect a structural fingerprint of a Score ---
function stats(score) {
  const s = {
    title: score.title,
    tracks: score.tracks.length,
    masterBars: score.masterBars.length,
    trackNames: [],
    perTrackBars: [],
    beats: 0,
    notes: 0,
    rests: 0,
    effects: {
      bends: 0,
      hammerPull: 0,
      ties: 0,
      tuplets: 0,
      harmonics: 0,
      slides: 0,
      dead: 0,
      palmMute: 0,
      vibrato: 0,
      ghost: 0,
      dynamics: 0,
    },
  };

  for (const track of score.tracks) {
    s.trackNames.push(track.name);
    let barsInTrack = 0;
    for (const staff of track.staves) {
      barsInTrack = Math.max(barsInTrack, staff.bars.length);
      for (const bar of staff.bars) {
        for (const voice of bar.voices) {
          for (const beat of voice.beats) {
            s.beats++;
            if (beat.isRest) s.rests++;
            if (beat.hasTuplet) s.effects.tuplets++;
            if (beat.dynamics !== undefined && beat.dynamics !== null) {
              // count beats that carry an explicit dynamic marker only when present
            }
            for (const note of beat.notes) {
              s.notes++;
              // Effects — guarded against enum/name differences across versions.
              if (note.hasBend) s.effects.bends++;
              if (note.isHammerPullOrigin) s.effects.hammerPull++;
              if (note.isTieOrigin) s.effects.ties++;
              if (note.harmonicType && note.harmonicType !== 0)
                s.effects.harmonics++;
              if (note.slideOutType && note.slideOutType !== 0)
                s.effects.slides++;
              if (note.isDead) s.effects.dead++;
              if (note.isPalmMute) s.effects.palmMute++;
              if (note.vibrato && note.vibrato !== 0) s.effects.vibrato++;
              if (note.isGhost) s.effects.ghost++;
            }
          }
        }
      }
    }
    s.perTrackBars.push(barsInTrack);
  }
  return s;
}

function diffStats(a, b) {
  const rows = [];
  const push = (label, x, y) =>
    rows.push({ metric: label, original: x, roundtrip: y, equal: x === y });
  push("tracks", a.tracks, b.tracks);
  push("masterBars (compassos)", a.masterBars, b.masterBars);
  push("beats", a.beats, b.beats);
  push("notes", a.notes, b.notes);
  push("rests", a.rests, b.rests);
  for (const k of Object.keys(a.effects)) {
    push(`effect:${k}`, a.effects[k], b.effects[k]);
  }
  return rows;
}

console.log(`\n# Round-trip: ${gpPath}\n`);

// 1) import .gp
const bytes = new Uint8Array(readFileSync(gpPath));
const score1 = ScoreLoader.loadScoreFromBytes(bytes);
const st1 = stats(score1);
console.log(`Importado .gp: "${st1.title}" — ${st1.tracks} trilhas, ${st1.masterBars} compassos`);
console.log("Trilhas:", st1.trackNames.join(" | "));

// 2) export to alphaTex
const tex = new AlphaTexExporter().exportToString(score1);
writeFileSync(new URL("./stairway.alphatex", import.meta.url), tex);
console.log(`\nExportado alphaTex: ${tex.length} chars -> spikes/stairway.alphatex`);

// 3) re-import alphaTex
let score2 = null;
let texError = null;
try {
  score2 = ScoreLoader.loadAlphaTex(tex);
} catch (e) {
  texError = e;
}

if (texError) {
  console.log("\n❌ Falha ao reimportar o alphaTex exportado:");
  console.log(String(texError && texError.message ? texError.message : texError));
} else {
  const st2 = stats(score2);
  console.log(`\nReimportado alphaTex: ${st2.tracks} trilhas, ${st2.masterBars} compassos`);
  console.log("\n## Fidelidade (original vs round-trip)\n");
  const rows = diffStats(st1, st2);
  for (const r of rows) {
    const mark = r.equal ? "ok " : "DIF";
    console.log(
      `[${mark}] ${r.metric.padEnd(22)} ${String(r.original).padStart(6)} -> ${String(r.roundtrip).padStart(6)}`,
    );
  }
  const diffs = rows.filter((r) => !r.equal);
  console.log(`\nResumo: ${diffs.length} métrica(s) divergente(s) de ${rows.length}.`);
}

// 4) cell addressing demo: get (track, measure)
function cell(score, trackIndex, barIndex) {
  const track = score.tracks[trackIndex];
  const staff = track.staves[0];
  const bar = staff.bars[barIndex];
  const beats = bar.voices.flatMap((v) => v.beats);
  return { track: track.name, barIndex, beatCount: beats.length };
}
console.log("\n## Endereçamento (trilha, compasso) no modelo");
console.log("cell(score, 0, 1) =>", JSON.stringify(cell(score1, 0, 1)));
console.log("cell(score, 6, 1) =>", JSON.stringify(cell(score1, 6, 1)));

console.log("\n(ok) spike concluído.\n");
