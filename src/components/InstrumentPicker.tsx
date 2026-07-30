"use client";

import {
  INSTRUMENT_FAMILIES,
  resolveInstrument,
  type DeclareSpec,
} from "@/lib/instrument-presets";

// Escolha de instrumento em dois passos, estilo Songsterr: primeiro o
// instrumento (Guitarra, Baixo…), depois as características — número de
// cordas e timbre (limpa, overdrive, aço, náilon…). Os selects extras só
// aparecem quando o instrumento tem mais de uma opção.

export function defaultSpec(): DeclareSpec {
  return { family: INSTRUMENT_FAMILIES[0].key };
}

/** Rótulo que a trilha vai receber ("Guitarra 7 cordas (overdrive)"). */
export function specLabel(spec: DeclareSpec): string {
  try {
    return resolveInstrument(spec).label;
  } catch {
    return "";
  }
}

export default function InstrumentPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: DeclareSpec;
  onChange: (spec: DeclareSpec) => void;
  disabled?: boolean;
}) {
  const family =
    INSTRUMENT_FAMILIES.find((f) => f.key === value.family) ?? INSTRUMENT_FAMILIES[0];

  return (
    <>
      <select
        aria-label="Instrumento"
        value={family.key}
        disabled={disabled}
        onChange={(e) => onChange({ family: e.target.value })}
      >
        {INSTRUMENT_FAMILIES.map((f) => (
          <option key={f.key} value={f.key}>{f.label}</option>
        ))}
      </select>

      {family.strings && family.strings.length > 1 && (
        <select
          aria-label="Número de cordas"
          value={value.strings ?? family.strings[0].count}
          disabled={disabled}
          onChange={(e) =>
            onChange({ ...value, family: family.key, strings: Number(e.target.value) })
          }
        >
          {family.strings.map((s) => (
            <option key={s.count} value={s.count}>{s.label}</option>
          ))}
        </select>
      )}

      {family.sounds.length > 1 && (
        <select
          aria-label="Timbre"
          value={value.sound ?? family.sounds[0].key}
          disabled={disabled}
          onChange={(e) =>
            onChange({ ...value, family: family.key, sound: e.target.value })
          }
        >
          {family.sounds.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
      )}
    </>
  );
}
