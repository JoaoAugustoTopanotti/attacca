// Rótulo legível de instrumento a partir do programa General MIDI.
// Usa as 16 famílias GM (grupos de 8 programas), o suficiente para distinguir
// guitarra de baixo e de bateria — o que importa no seletor de trilhas.

const GM_FAMILIES = [
  "Piano",
  "Percussão cromática",
  "Órgão",
  "Guitarra/Violão",
  "Baixo",
  "Cordas",
  "Conjunto",
  "Metais",
  "Palhetas",
  "Sopros",
  "Synth lead",
  "Synth pad",
  "Synth FX",
  "Étnico",
  "Percussivo",
  "Efeitos",
];

export function instrumentLabel(program: number, isPercussion: boolean): string {
  if (isPercussion) return "Bateria/Percussão";
  const family = Math.floor(program / 8);
  return GM_FAMILIES[Math.max(0, Math.min(GM_FAMILIES.length - 1, family))];
}
