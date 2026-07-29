// Lista leve de presets, não uma ontologia de instrumentos. Dado puro,
// importável tanto de client components quanto do servidor (declareTrack,
// profile) — manter sem imports de prisma ou de módulos do Node.

export type InstrumentPreset = {
  key: string;
  label: string;
  program: number; // programa General MIDI
  tuning: string | null; // tokens alphaTex; null = sem cordas (pauta padrão)
  isPercussion: boolean;
};

export const INSTRUMENT_PRESETS: InstrumentPreset[] = [
  // Programas GM: 24 = violão náilon, 25 = violão aço, 27 = guitarra limpa.
  // Trilhas já declaradas guardam o próprio \instrument e não mudam com edições
  // desta lista.
  { key: "guitar", label: "Guitarra", program: 27, tuning: "E4 B3 G3 D3 A2 E2", isPercussion: false },
  { key: "acoustic", label: "Violão (aço)", program: 25, tuning: "E4 B3 G3 D3 A2 E2", isPercussion: false },
  { key: "nylon", label: "Violão (náilon)", program: 24, tuning: "E4 B3 G3 D3 A2 E2", isPercussion: false },
  { key: "guitar7", label: "Guitarra 7 cordas", program: 27, tuning: "E4 B3 G3 D3 A2 E2 B1", isPercussion: false },
  { key: "bass", label: "Baixo", program: 33, tuning: "G2 D2 A1 E1", isPercussion: false },
  { key: "bass5", label: "Baixo 5 cordas", program: 33, tuning: "G2 D2 A1 E1 B0", isPercussion: false },
  { key: "piano", label: "Piano/Teclado", program: 0, tuning: null, isPercussion: false },
  { key: "vocals", label: "Vocal", program: 52, tuning: null, isPercussion: false },
  { key: "drums", label: "Bateria", program: 0, tuning: null, isPercussion: true },
];
