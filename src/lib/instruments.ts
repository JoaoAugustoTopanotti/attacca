// Human-readable instrument label from a General MIDI program number.
// We use the 16 GM families (groups of 8 programs) — enough to tell guitar
// from bass from drums, which is what matters for the track selector.

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
