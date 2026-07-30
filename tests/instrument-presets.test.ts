import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveInstrument,
  LEGACY_PRESET_SPECS,
  INSTRUMENT_FAMILIES,
} from "../src/lib/instrument-presets";

test("padrão da família: rótulo limpo, timbre e cordas default", () => {
  const r = resolveInstrument({ family: "guitar" });
  assert.equal(r.label, "Guitarra");
  assert.equal(r.program, 27);
  assert.equal(r.tuning, "E4 B3 G3 D3 A2 E2");
  assert.equal(r.isPercussion, false);
});

test("características fora do padrão entram no rótulo", () => {
  const r = resolveInstrument({ family: "guitar", sound: "distortion", strings: 7 });
  assert.equal(r.label, "Guitarra 7 cordas (distorção)");
  assert.equal(r.program, 30);
  assert.equal(r.tuning, "E4 B3 G3 D3 A2 E2 B1");
});

test("timbre não-padrão sozinho vira só o sobrenome", () => {
  const r = resolveInstrument({ family: "acoustic", sound: "nylon" });
  assert.equal(r.label, "Violão (náilon)");
  assert.equal(r.program, 24);
});

test("bateria é percussão, sem cordas", () => {
  const r = resolveInstrument({ family: "drums" });
  assert.equal(r.isPercussion, true);
  assert.equal(r.tuning, null);
});

test("família/timbre/cordas desconhecidos lançam", () => {
  assert.throws(() => resolveInstrument({ family: "theremin" }));
  assert.throws(() => resolveInstrument({ family: "guitar", sound: "acid" }));
  assert.throws(() => resolveInstrument({ family: "bass", strings: 12 }));
});

test("toda chave legada resolve para um instrumento válido", () => {
  for (const [key, spec] of Object.entries(LEGACY_PRESET_SPECS)) {
    const r = resolveInstrument(spec);
    assert.ok(r.label.length > 0, `legado ${key} sem rótulo`);
  }
  // Compat: o baixo de 5 cordas legado mantém a afinação de antes.
  assert.equal(resolveInstrument(LEGACY_PRESET_SPECS.bass5).tuning, "G2 D2 A1 E1 B0");
});

test("o primeiro som e a primeira opção de cordas são o padrão declarado", () => {
  for (const f of INSTRUMENT_FAMILIES) {
    assert.ok(f.sounds.length > 0, `${f.key} sem timbres`);
    const r = resolveInstrument({ family: f.key });
    assert.equal(r.program, f.sounds[0].program);
    if (f.strings) assert.equal(r.tuning, f.strings[0].tuning);
  }
});
