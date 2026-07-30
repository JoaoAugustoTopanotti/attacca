// Testes das correções de parsing (aspas e duração 128).
// Rodar: npm test  (tsx --test tests/*.test.ts)

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  splitBars,
  parseTrackTex,
  serializeModel,
} from "../src/lib/alphatex-editor";
import { parseBar, serializeBar } from "../src/lib/drum-grid";

// ── splitBars: "|" separa compassos só fora de aspas/grupos ───────────────────

test("splitBars divide compassos simples", () => {
  assert.deepEqual(splitBars("a | b | c").map((s) => s.trim()), ["a", "b", "c"]);
});

test("splitBars ignora | dentro de aspas duplas", () => {
  const tex = '2.3.8{lyrics (0 "la|la")} | r.4';
  assert.equal(splitBars(tex).length, 2);
});

test("splitBars ignora | dentro de aspas simples", () => {
  const tex = "2.3.8{ch 'A|B'} | r.4";
  assert.equal(splitBars(tex).length, 2);
});

test("splitBars ignora | dentro de chaves/parênteses", () => {
  const tex = "2.3.8{lyrics (0 x|y)} | r.4";
  assert.equal(splitBars(tex).length, 2);
});

test("splitBars preserva compasso vazio (célula sem contribuição)", () => {
  assert.equal(splitBars("r.1 | | r.1").length, 3);
});

// ── parseTrackTex/serializeModel: strings com ")" "}" espaço e "|" ────────────

test("anotação com ')' e espaço dentro de aspas round-tripa intacta", () => {
  const tex = '2.3.8{lyrics (0 "a) b")}';
  const model = parseTrackTex(tex);
  assert.equal(model.measures.length, 1);
  assert.equal(model.measures[0].beats.length, 1);
  const out = serializeModel(model);
  assert.ok(out.includes('"a) b"'), `anotação corrompida: ${out}`);
});

test("letra fatiada com parêntese aberto na string não quebra o beat", () => {
  const tex = '0.6.16{lyrics (0 "(la")} 2.6.16{lyrics (0 "la)")}';
  const model = parseTrackTex(tex);
  assert.equal(model.measures[0].beats.length, 2);
  const out = serializeModel(model);
  assert.ok(out.includes('"(la"'));
  assert.ok(out.includes('"la)"'));
});

test("compasso com | dentro de lyrics conta como UM compasso", () => {
  const tex = '2.3.4{lyrics (0 "oh|oh")} r.4 r.4 r.4';
  const model = parseTrackTex(tex);
  assert.equal(model.measures.length, 1);
});

// ── Duração 128 ───────────────────────────────────────────────────────────────

test("duração 128 é reconhecida e preservada", () => {
  const model = parseTrackTex("5.6.128 7.6.128 r.2 r.4 r.8 r.16 r.16");
  assert.equal(model.measures[0].beats[0].duration, 128);
  const out = serializeModel(model);
  assert.ok(out.includes(".128"), `.128 sumiu: ${out}`);
});

test("duração inválida continua caindo no sticky (não vira lixo)", () => {
  const model = parseTrackTex(":4 5.6.999");
  assert.equal(model.measures[0].beats[0].duration, 4);
});

// ── Nota ligada (tie): {t} é efeito de primeira classe ────────────────────────

test("{t} vira efeito editável e round-tripa", () => {
  const model = parseTrackTex("3.2.4 3.2{t}.4 r.4 r.4");
  const tied = model.measures[0].beats[1].notes[0];
  assert.ok(tied.effects.includes("t"), "efeito t não reconhecido");
  const out = serializeModel(model);
  assert.ok(/3\.2\{[^}]*\bt\b[^}]*\}/.test(out), `{t} sumiu: ${out}`);
});

test("{t} no grupo único do exporter não engole os outros efeitos", () => {
  const model = parseTrackTex("3.2{v t pm}.4 r.4 r.4 r.4");
  const fx = model.measures[0].beats[0].notes[0].effects;
  assert.deepEqual([...fx].sort(), ["pm", "t", "v"]);
});

test("'t' depois de lf é dedo (polegar), não tie", () => {
  const model = parseTrackTex("3.2{lf t}.4 r.4 r.4 r.4");
  const note = model.measures[0].beats[0].notes[0];
  assert.ok(!note.effects.includes("t"), "argumento de lf virou efeito");
  assert.ok(note.suffix?.includes("lf t"), `lf t não preservado: ${note.suffix}`);
});

// ── drum-grid: acorde + quiáltera com parênteses no grupo ─────────────────────

test("parseBar aceita acorde com {tu (3 2)} (antes caía para texto)", () => {
  // 1 tempo em tercinas + 3 tempos de pausa = 4/4.
  const bar =
    "(36 42).8{tu (3 2)} (38).8{tu (3 2)} (42).8{tu (3 2)} r.4 r.4 r.4";
  const g = parseBar(bar, 4, 4, 16);
  assert.equal(g.parseOk, true);
  const out = serializeBar(g, 16);
  assert.ok(out.includes("36"), `serialização perdeu o bumbo: ${out}`);
});
