// Light preset list (not an instrument ontology). Pure data, importable from
// client components (the welcome step) and server code (declareTrack, profile)
// alike — keep it free of prisma/node imports.

export type InstrumentPreset = {
  key: string;
  label: string;
  program: number; // GM
  tuning: string | null; // alphaTex tokens, null = non-stringed (standard staff)
  isPercussion: boolean;
};

export const INSTRUMENT_PRESETS: InstrumentPreset[] = [
  { key: "guitar", label: "Guitarra", program: 25, tuning: "E4 B3 G3 D3 A2 E2", isPercussion: false },
  { key: "guitar7", label: "Guitarra 7 cordas", program: 25, tuning: "E4 B3 G3 D3 A2 E2 B1", isPercussion: false },
  { key: "bass", label: "Baixo", program: 33, tuning: "G2 D2 A1 E1", isPercussion: false },
  { key: "bass5", label: "Baixo 5 cordas", program: 33, tuning: "G2 D2 A1 E1 B0", isPercussion: false },
  { key: "piano", label: "Piano/Teclado", program: 0, tuning: null, isPercussion: false },
  { key: "vocals", label: "Vocal", program: 52, tuning: null, isPercussion: false },
  { key: "drums", label: "Bateria", program: 0, tuning: null, isPercussion: true },
];
