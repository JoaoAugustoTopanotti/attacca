// Extrai um subconjunto de presets de um .sf2 para um arquivo novo e pequeno.
//
//   node scripts/subset-sf2.mjs <origem.sf2> <destino.sf2> <programas> [ganhos]
//
// Foi assim que `public/sf/guitars.sf2` nasceu — ver o README de lá para o
// porquê. Para regerar a partir do GeneralUser GS v2.0.3:
//
//   node scripts/subset-sf2.mjs GeneralUser-GS.sf2 public/sf/guitars.sf2 \
//     24,25,26,27,28,29,30,31 30:7
//
// Só banco 0 (GM melódico); percussão (banco 128) não é selecionável.
import fs from "node:fs";

const [srcPath, dstPath, progList, gainList] = process.argv.slice(2);
const WANT = new Set(progList.split(",").map(Number));
// Ganho por programa, em dB: "29:+3,30:+7". Subtraído da atenuação de preset
// (gerador 48, em centibéis). O banco de origem calibra os presets entre si;
// como aqui eles convivem com OUTRO banco (baixo/bateria seguem no sonivox),
// essa calibragem não se aplica e os presets são reequilibrados na medida.
const GAIN = new Map(
  (gainList ?? "").split(",").filter(Boolean).map((s) => {
    const [p, db] = s.split(":");
    return [Number(p), Number(db)];
  }),
);
const src = fs.readFileSync(srcPath);

// ---------- leitura ----------
const chunks = {};
(function walk(start, end) {
  let p = start;
  while (p + 8 <= end) {
    const id = src.toString("ascii", p, p + 4);
    const size = src.readUInt32LE(p + 4);
    if (id === "LIST") {
      const t = src.toString("ascii", p + 8, p + 12);
      if (["pdta", "sdta", "INFO"].includes(t)) walk(p + 12, p + 8 + size);
    } else chunks[id] = { off: p + 8, size };
    p += 8 + size + (size % 2);
  }
})(12, src.length);

if (chunks.sm24) throw new Error("sm24 (24 bits) não suportado por este subsetter.");

const rec = (id, len, fn) => {
  const { off, size } = chunks[id];
  const out = [];
  for (let i = 0; i + len <= size; i += len) out.push(fn(off + i, off + i + len));
  return out;
};
const raw = (a, b) => Buffer.from(src.subarray(a, b));

const phdr = rec("phdr", 38, (o, e) => ({
  name: src.toString("ascii", o, o + 20).replace(/\0.*/, ""),
  preset: src.readUInt16LE(o + 20),
  bank: src.readUInt16LE(o + 22),
  bag: src.readUInt16LE(o + 24),
  tail: raw(o + 26, e), // library/genre/morphology
}));
const pbag = rec("pbag", 4, (o) => ({ gen: src.readUInt16LE(o), mod: src.readUInt16LE(o + 2) }));
const pmod = rec("pmod", 10, (o, e) => raw(o, e));
const pgen = rec("pgen", 4, (o) => ({ op: src.readUInt16LE(o), amt: src.readUInt16LE(o + 2) }));
const inst = rec("inst", 22, (o) => ({
  name: src.toString("ascii", o, o + 20).replace(/\0.*/, ""),
  bag: src.readUInt16LE(o + 20),
}));
const ibag = rec("ibag", 4, (o) => ({ gen: src.readUInt16LE(o), mod: src.readUInt16LE(o + 2) }));
const imod = rec("imod", 10, (o, e) => raw(o, e));
const igen = rec("igen", 4, (o) => ({ op: src.readUInt16LE(o), amt: src.readUInt16LE(o + 2) }));
const shdr = rec("shdr", 46, (o) => ({
  name: src.toString("ascii", o, o + 20).replace(/\0.*/, ""),
  start: src.readUInt32LE(o + 20),
  end: src.readUInt32LE(o + 24),
  loopStart: src.readUInt32LE(o + 28),
  loopEnd: src.readUInt32LE(o + 32),
  rate: src.readUInt32LE(o + 36),
  pitch: src.readUInt8(o + 40),
  correction: src.readInt8(o + 41),
  link: src.readUInt16LE(o + 42),
  type: src.readUInt16LE(o + 44),
}));

const GEN_INSTRUMENT = 41;
const GEN_SAMPLEID = 53;
const GEN_ATTENUATION = 48;

// zonas de um item (preset ou instrumento), já com generators e modulators fatiados
function zonesOf(items, i, bags, gens, mods) {
  const from = items[i].bag;
  const to = items[i + 1].bag; // todo sf2 tem registro terminal
  const out = [];
  for (let b = from; b < to; b++) {
    const gs = bags[b].gen, ge = b + 1 < bags.length ? bags[b + 1].gen : gens.length;
    const ms = bags[b].mod, me = b + 1 < bags.length ? bags[b + 1].mod : mods.length;
    out.push({ gens: gens.slice(gs, ge), mods: mods.slice(ms, me) });
  }
  return out;
}

// ---------- seleção ----------
const keptPresets = [];
const instUsed = new Set();
for (let i = 0; i < phdr.length - 1; i++) {
  const p = phdr[i];
  if (p.bank !== 0 || !WANT.has(p.preset)) continue;
  const zones = zonesOf(phdr, i, pbag, pgen, pmod);
  const gainDb = GAIN.get(p.preset) ?? 0;
  for (const z of zones) {
    for (const g of z.gens) if (g.op === GEN_INSTRUMENT) instUsed.add(g.amt);
    if (!gainDb) continue;
    for (const g of z.gens) {
      if (g.op !== GEN_ATTENUATION) continue;
      const before = g.amt;
      g.amt = Math.max(0, g.amt - Math.round(gainDb * 10));
      console.log(`  preset ${p.preset}: atenuação ${before / 10}dB -> ${g.amt / 10}dB`);
    }
  }
  keptPresets.push({ hdr: p, zones });
}
if (!keptPresets.length) throw new Error("nenhum preset selecionado");

const instIdx = [...instUsed].sort((a, b) => a - b);
const instMap = new Map(instIdx.map((v, i) => [v, i]));

const smpUsed = new Set();
const keptInsts = instIdx.map((i) => {
  const zones = zonesOf(inst, i, ibag, igen, imod);
  for (const z of zones) for (const g of z.gens) if (g.op === GEN_SAMPLEID) smpUsed.add(g.amt);
  return { hdr: inst[i], zones };
});

// samples ligados em estéreo precisam do par, senão a ligação fica órfã
for (const s of [...smpUsed]) {
  const sh = shdr[s];
  if (sh.type !== 1 && sh.link < shdr.length - 1) smpUsed.add(sh.link);
}
const smpIdx = [...smpUsed].sort((a, b) => a - b);
const smpMap = new Map(smpIdx.map((v, i) => [v, i]));

// ---------- escrita ----------
const PAD = 46; // amostras de silêncio exigidas depois de cada sample
const smplParts = [];
const newShdr = [];
let cursor = 0;
for (const i of smpIdx) {
  const s = shdr[i];
  const n = s.end - s.start;
  smplParts.push(raw(chunks.smpl.off + s.start * 2, chunks.smpl.off + s.end * 2));
  smplParts.push(Buffer.alloc(PAD * 2));
  newShdr.push({
    ...s,
    start: cursor,
    end: cursor + n,
    loopStart: cursor + (s.loopStart - s.start),
    loopEnd: cursor + (s.loopEnd - s.start),
    link: smpMap.has(s.link) ? smpMap.get(s.link) : 0,
    type: smpMap.has(s.link) ? s.type : 1,
  });
  cursor += n + PAD;
}
const smpl = Buffer.concat(smplParts);

function name20(s) {
  const b = Buffer.alloc(20);
  b.write(s.slice(0, 19), "ascii");
  return b;
}
function chunk(id, body) {
  const head = Buffer.alloc(8);
  head.write(id, 0, "ascii");
  head.writeUInt32LE(body.length, 4);
  return body.length % 2 ? [head, body, Buffer.alloc(1)] : [head, body];
}

// pdta: monta bags/gens/mods lineares e os índices
function buildLists(items, remapGen) {
  const bags = [], gens = [], mods = [], heads = [];
  for (const it of items) {
    heads.push({ hdr: it.hdr, bag: bags.length });
    for (const z of it.zones) {
      bags.push({ gen: gens.length, mod: mods.length });
      for (const g of z.gens) gens.push(remapGen(g));
      for (const m of z.mods) mods.push(m);
    }
  }
  return { bags, gens, mods, heads };
}

const P = buildLists(keptPresets, (g) =>
  g.op === GEN_INSTRUMENT ? { op: g.op, amt: instMap.get(g.amt) } : g,
);
const I = buildLists(keptInsts, (g) =>
  g.op === GEN_SAMPLEID ? { op: g.op, amt: smpMap.get(g.amt) } : g,
);

function packBags(bags, genLen, modLen) {
  const b = Buffer.alloc((bags.length + 1) * 4);
  bags.forEach((x, i) => { b.writeUInt16LE(x.gen, i * 4); b.writeUInt16LE(x.mod, i * 4 + 2); });
  b.writeUInt16LE(genLen, bags.length * 4);
  b.writeUInt16LE(modLen, bags.length * 4 + 2);
  return b;
}
function packGens(gens) {
  const b = Buffer.alloc((gens.length + 1) * 4);
  gens.forEach((g, i) => { b.writeUInt16LE(g.op, i * 4); b.writeUInt16LE(g.amt, i * 4 + 2); });
  return b; // registro terminal zerado
}
function packMods(mods) {
  return Buffer.concat([...mods, Buffer.alloc(10)]);
}

const phdrBuf = Buffer.concat([
  ...P.heads.map((h) => {
    const b = Buffer.alloc(38);
    name20(h.hdr.name).copy(b, 0);
    b.writeUInt16LE(h.hdr.preset, 20);
    b.writeUInt16LE(h.hdr.bank, 22);
    b.writeUInt16LE(h.bag, 24);
    h.hdr.tail.copy(b, 26);
    return b;
  }),
  (() => { const b = Buffer.alloc(38); name20("EOP").copy(b, 0); b.writeUInt16LE(P.bags.length, 24); return b; })(),
]);

const instBuf = Buffer.concat([
  ...I.heads.map((h) => {
    const b = Buffer.alloc(22);
    name20(h.hdr.name).copy(b, 0);
    b.writeUInt16LE(h.bag, 20);
    return b;
  }),
  (() => { const b = Buffer.alloc(22); name20("EOI").copy(b, 0); b.writeUInt16LE(I.bags.length, 20); return b; })(),
]);

const shdrBuf = Buffer.concat([
  ...newShdr.map((s) => {
    const b = Buffer.alloc(46);
    name20(s.name).copy(b, 0);
    b.writeUInt32LE(s.start, 20); b.writeUInt32LE(s.end, 24);
    b.writeUInt32LE(s.loopStart, 28); b.writeUInt32LE(s.loopEnd, 32);
    b.writeUInt32LE(s.rate, 36); b.writeUInt8(s.pitch, 40);
    b.writeInt8(s.correction, 41); b.writeUInt16LE(s.link, 42); b.writeUInt16LE(s.type, 44);
    return b;
  }),
  (() => { const b = Buffer.alloc(46); name20("EOS").copy(b, 0); return b; })(),
]);

const zstr = (s) => { const b = Buffer.from(s + "\0", "ascii"); return b.length % 2 ? Buffer.concat([b, Buffer.alloc(1)]) : b; };
const ifil = Buffer.alloc(4); ifil.writeUInt16LE(2, 0); ifil.writeUInt16LE(1, 2);

const info = Buffer.concat([
  Buffer.from("INFO", "ascii"),
  ...chunk("ifil", ifil),
  ...chunk("isng", zstr("EMU8000")),
  ...chunk("INAM", zstr("attacca guitars (GeneralUser GS subset)")),
  ...chunk("IENG", zstr("S. Christian Collins")),
  ...chunk("ICOP", zstr("GeneralUser GS License v2.0 - see LICENSE-guitars.txt")),
  ...chunk("ICMT", zstr("Subconjunto dos presets de guitarra (GM " + progList + ") do GeneralUser GS, extraido para o attacca.")),
]);
const sdta = Buffer.concat([Buffer.from("sdta", "ascii"), ...chunk("smpl", smpl)]);
const pdta = Buffer.concat([
  Buffer.from("pdta", "ascii"),
  ...chunk("phdr", phdrBuf),
  ...chunk("pbag", packBags(P.bags, P.gens.length, P.mods.length)),
  ...chunk("pmod", packMods(P.mods)),
  ...chunk("pgen", packGens(P.gens)),
  ...chunk("inst", instBuf),
  ...chunk("ibag", packBags(I.bags, I.gens.length, I.mods.length)),
  ...chunk("imod", packMods(I.mods)),
  ...chunk("igen", packGens(I.gens)),
  ...chunk("shdr", shdrBuf),
]);

const body = Buffer.concat([
  Buffer.from("sfbk", "ascii"),
  ...chunk("LIST", info),
  ...chunk("LIST", sdta),
  ...chunk("LIST", pdta),
]);
const out = Buffer.concat(chunk("RIFF", body));
fs.writeFileSync(dstPath, out);

console.log(
  `presets=${keptPresets.length} instrumentos=${keptInsts.length} samples=${smpIdx.length}\n` +
  `${dstPath}: ${(out.length / 1048576).toFixed(2)} MB (origem ${(src.length / 1048576).toFixed(1)} MB)`
);
