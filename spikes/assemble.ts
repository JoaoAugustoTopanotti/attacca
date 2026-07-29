// DISPOSABLE SPIKE — runs the SAME decompose/assemble code the service ships
// (src/lib/alphatex-grid.ts), with structural fidelity (not just notes).
//
//   PART A: alphaTex FORMAT round-trip preserves structure?
//   PART B: decompose -> assembleFull (cell = full bar fragment) lossless?
//   PART C: decompose -> assembleSeparated (structPrefix shared on Measure +
//           notes per cell == the production schema) lossless?
//
// Run: npx tsx spikes/assemble.ts [path-to-.gp]

import { readFileSync } from "node:fs";
import * as alphaTab from "@coderline/alphatab";
import {
  decompose,
  toNormalized,
  assembleFromNormalized,
  type Grid,
} from "../src/lib/alphatex-grid";

// Helpers locais do spike (antes exportados pela lib; só este script os usa).
const nonEmpty = (l: string) => l.trim() !== "";

/** Remontagem com estrutura compartilhada — o caminho usado em produção. */
function assembleSeparated(grid: Grid): string {
  return assembleFromNormalized(toNormalized(grid));
}

/** Remontagem plana, bloco de voz a bloco de voz, sem normalizar. */
function assembleFull(grid: Grid): string {
  const out: string[] = [];
  out.push(...grid.globalHeader.filter(nonEmpty));
  grid.tracks.forEach((tr) => {
    out.push(...tr.header);
    tr.voices.forEach((voiceRun, v) => {
      if (v > 0) out.push("\\voice");
      voiceRun.forEach((barTokens, m) => {
        const chunk = barTokens.filter(nonEmpty);
        out.push(...(chunk.length ? chunk : ["r.1"]));
        if (m < voiceRun.length - 1) out.push("|");
      });
    });
  });
  return out.join("\n");
}

const { ScoreLoader } = alphaTab.importer;
const { AlphaTexExporter } = alphaTab.exporter;

function exportWithComments(score: any): string {
  const s = new alphaTab.Settings();
  s.exporter.comments = true;
  return new AlphaTexExporter().exportToString(score, s);
}

function noteFingerprint(score: any) {
  let notes = 0;
  const tokens: string[] = [];
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
function structFingerprint(score: any) {
  const mb = score.masterBars.map((m: any) => ({
    ts: `${m.timeSignatureNumerator}/${m.timeSignatureDenominator}`,
    key: `${m.keySignature}/${m.keySignatureType}`,
    repStart: !!m.isRepeatStart,
    repEnd: !!m.isRepeatEnd,
    repCount: m.repeatCount,
    altEnd: m.alternateEndings | 0,
    section: m.section ? `${m.section.marker ?? ""}|${m.section.text ?? ""}` : "",
    directions: m.directions ? [...m.directions].sort((a: number, b: number) => a - b).join(",") : "",
    tempo: (m.tempoAutomations ?? []).map((a: any) => a.value).join(","),
  }));
  const bars: string[] = [];
  score.tracks.forEach((t: any, ti: number) =>
    t.staves[0].bars.forEach((b: any, bi: number) =>
      bars.push(`${ti},${bi}:clef${b.clef}/${b.clefOttava}:bl${b.barLineRight}`),
    ),
  );
  return { initialTempo: score.tempo, mb, bars };
}
function lossSummary(a: any, b: any): string {
  const fl: Record<string, number> = {};
  const bump = (f: string) => (fl[f] = (fl[f] ?? 0) + 1);
  if (a.initialTempo !== b.initialTempo) bump("initialTempo");
  if (a.mb.length !== b.mb.length) bump("mbCount");
  const fields = ["ts", "key", "repStart", "repEnd", "repCount", "altEnd", "section", "directions", "tempo"];
  for (let i = 0; i < Math.min(a.mb.length, b.mb.length); i++)
    for (const f of fields)
      if (String(a.mb[i][f]) !== String(b.mb[i]?.[f])) bump(f);
  for (let i = 0; i < Math.min(a.bars.length, b.bars.length); i++)
    if (a.bars[i] !== b.bars[i]) bump("clef/barline");
  const k = Object.keys(fl);
  return k.length === 0 ? "nenhuma ✅" : k.map((x) => `${x}:${fl[x]}`).join("  ");
}

function run(label: string, score1: any) {
  console.log(`\n========== ${label} ==========`);
  const n1 = noteFingerprint(score1);
  const s1 = structFingerprint(score1);
  console.log(`origem: ${score1.tracks.length} trilhas, ${score1.masterBars.length} compassos, ${n1.notes} notas`);

  const A = ScoreLoader.loadAlphaTex(new AlphaTexExporter().exportToString(score1));
  console.log(`PART A (formato):    notas ${noteFingerprint(A).sig === n1.sig ? "OK" : "❌"} | estrutura ${lossSummary(s1, structFingerprint(A))}`);

  const annotated = exportWithComments(score1);
  const grid = decompose(annotated);

  const B = ScoreLoader.loadAlphaTex(assembleFull(grid));
  console.log(`PART B (full chunk): notas ${noteFingerprint(B).sig === n1.sig ? "OK ✅" : "❌"} | estrutura ${lossSummary(s1, structFingerprint(B))}`);

  const C = ScoreLoader.loadAlphaTex(assembleSeparated(grid));
  console.log(`PART C (schema ADR): notas ${noteFingerprint(C).sig === n1.sig ? "OK ✅" : "❌"} | estrutura ${lossSummary(s1, structFingerprint(C))}`);
}

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
