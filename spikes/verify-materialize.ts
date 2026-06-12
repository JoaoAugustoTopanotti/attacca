// DISPOSABLE — verify assemble-from-DB == canonical (notes + structure).
// Run: npx tsx spikes/verify-materialize.ts <songId> [port]
import * as alphaTab from "@coderline/alphatab";
import { PrismaClient } from "@prisma/client";

const songId = process.argv[2];
const port = process.argv[3] ?? "3000";

function noteSig(score: any) {
  const t: string[] = [];
  for (const tr of score.tracks)
    for (const sf of tr.staves)
      for (const b of sf.bars)
        for (const v of b.voices)
          for (const be of v.beats)
            for (const n of be.notes) t.push(`${n.fret}.${n.string}`);
  return { count: t.length, sig: t.join(" ") };
}
function structSig(score: any) {
  const mb = score.masterBars.map((m: any) =>
    [
      `${m.timeSignatureNumerator}/${m.timeSignatureDenominator}`,
      `${m.keySignature}/${m.keySignatureType}`,
      m.isRepeatStart, m.isRepeatEnd, m.repeatCount, m.alternateEndings | 0,
      m.section ? `${m.section.marker ?? ""}|${m.section.text ?? ""}` : "",
      m.directions ? [...m.directions].sort((a: number, b: number) => a - b).join(",") : "",
      (m.tempoAutomations ?? []).map((a: any) => a.value).join(","),
    ].join(";"),
  );
  const bars: string[] = [];
  score.tracks.forEach((tr: any, ti: number) =>
    tr.staves[0].bars.forEach((b: any, bi: number) => bars.push(`${ti},${bi}:${b.clef}/${b.clefOttava}/${b.barLineRight}`)),
  );
  return { mb, bars, tempo: score.tempo, tracks: score.tracks.length, voices: score.tracks.map((t: any) => t.staves[0].bars[0].voices.length).join(",") };
}

(async () => {
  const prisma = new PrismaClient();
  const rev = await prisma.revision.findFirst({ where: { songId, alphaTex: { not: null } }, orderBy: { number: "desc" } });
  await prisma.$disconnect();
  if (!rev?.alphaTex) throw new Error("no canonical");

  const assembled = await (await fetch(`http://localhost:${port}/api/songs/${songId}/assembled`)).text();

  const a = alphaTab.importer.ScoreLoader.loadAlphaTex(rev.alphaTex); // canonical
  const b = alphaTab.importer.ScoreLoader.loadAlphaTex(assembled); // from cells

  const na = noteSig(a), nb = noteSig(b);
  const sa = structSig(a), sb = structSig(b);

  console.log(`canonical:  ${sa.tracks} trilhas, ${sa.mb.length} compassos, ${na.count} notas, vozes/trilha[0..]=${sa.voices}`);
  console.log(`from cells: ${sb.tracks} trilhas, ${sb.mb.length} compassos, ${nb.count} notas, vozes/trilha[0..]=${sb.voices}`);
  console.log(`\nNOTAS idênticas:      ${na.sig === nb.sig ? "✅" : "❌"}`);
  const mbEqual = sa.mb.length === sb.mb.length && sa.mb.every((x: string, i: number) => x === sb.mb[i]);
  const barsEqual = sa.bars.length === sb.bars.length && sa.bars.every((x: string, i: number) => x === sb.bars[i]);
  console.log(`ESTRUTURA masterbar: ${mbEqual ? "✅" : "❌"}`);
  console.log(`CLAVE/BARRAS:        ${barsEqual ? "✅" : "❌"}`);
  console.log(`TRILHAS/TEMPO:       ${sa.tracks === sb.tracks && sa.tempo === sb.tempo ? "✅" : "❌"}`);
  if (!mbEqual) {
    for (let i = 0; i < Math.min(sa.mb.length, sb.mb.length); i++)
      if (sa.mb[i] !== sb.mb[i]) { console.log(`  mb#${i}: ${sa.mb[i]}  !=  ${sb.mb[i]}`); break; }
  }
  const pass = na.sig === nb.sig && mbEqual && barsEqual && sa.tracks === sb.tracks;
  console.log(`\n=> ${pass ? "PASSOU ✅ — round-trip célula→alphaTex idêntico" : "REVISAR ❌"}`);
})();
