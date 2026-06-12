// DISPOSABLE SPIKE — structural fidelity of the alphaTex FORMAT round-trip,
// using a controlled score rich in structure (repeats, alternate endings,
// key/clef/ts/tempo changes, sections, jumps segno/coda/fine/dacapo).
//
// Run: node spikes/struct.mjs

import * as alphaTab from "@coderline/alphatab";
const { ScoreLoader } = alphaTab.importer;
const { AlphaTexExporter } = alphaTab.exporter;

const TEX = `\\title "Struct Test"
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
`;

function struct(score) {
  return score.masterBars.map((m, i) => ({
    i,
    ts: `${m.timeSignatureNumerator}/${m.timeSignatureDenominator}`,
    key: `${m.keySignature}/${m.keySignatureType}`,
    repStart: !!m.isRepeatStart,
    repEnd: !!m.isRepeatEnd,
    repCount: m.repeatCount,
    altEnd: m.alternateEndings | 0,
    dbl: !!m.isDoubleBar,
    section: m.section ? `${m.section.marker ?? ""}|${m.section.text ?? ""}` : "",
    directions: m.directions ? [...m.directions].sort((a, b) => a - b).join(",") : "",
    tempo: (m.tempoAutomations ?? []).map((a) => a.value).join(","),
    clef: `${m.score ? "" : ""}`, // clef is per-bar; filled below
  }));
}
function clefs(score) {
  return score.tracks[0].staves[0].bars.map((b) => `${b.clef}/${b.clefOttava}`);
}

let score1;
try {
  score1 = ScoreLoader.loadAlphaTex(TEX);
} catch (e) {
  console.log("❌ alphaTex controlado NÃO parseia:", e?.message?.split("\n")[0] ?? e);
  process.exit(1);
}

const s1 = struct(score1);
const c1 = clefs(score1);
console.log(`controlado: ${score1.masterBars.length} compassos`);
console.log("estrutura original:");
s1.forEach((m, i) =>
  console.log(
    `  mb#${i} ts=${m.ts} key=${m.key} ro=${m.repStart} rc=${m.repEnd}/${m.repCount} ae=${m.altEnd} sec="${m.section}" dir=[${m.directions}] tempo=[${m.tempo}] clef=${c1[i]}`,
  ),
);

// round-trip
const tex2 = new AlphaTexExporter().exportToString(score1);
const score2 = ScoreLoader.loadAlphaTex(tex2);
const s2 = struct(score2);
const c2 = clefs(score2);

console.log("\nperdas no round-trip:");
const fields = ["ts", "key", "repStart", "repEnd", "repCount", "altEnd", "dbl", "section", "directions", "tempo"];
let losses = 0;
for (let i = 0; i < s1.length; i++) {
  for (const f of fields) {
    if (String(s1[i][f]) !== String(s2[i]?.[f])) {
      losses++;
      console.log(`  mb#${i}.${f}: ${JSON.stringify(s1[i][f])} -> ${JSON.stringify(s2[i]?.[f])}`);
    }
  }
  if (c1[i] !== c2[i]) {
    losses++;
    console.log(`  mb#${i}.clef: ${c1[i]} -> ${c2[i]}`);
  }
}
console.log(`\n${losses === 0 ? "nenhuma perda estrutural ✅" : losses + " divergência(s) estrutural(is) ❌"}`);
