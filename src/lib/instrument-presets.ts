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

// ── Declaração de trilha em dois passos (estilo Songsterr) ──────────────────
// Primeiro o instrumento, depois as características: som/timbre (programa GM)
// e número de cordas (afinação). A lista plana acima continua sendo a moeda do
// perfil ("instrumentos que eu toco" guarda essas chaves no banco); esta
// estrutura serve só à declaração de slots.

export type InstrumentSound = {
  key: string;
  label: string;
  program: number; // programa General MIDI
};

export type InstrumentStrings = {
  count: number;
  label: string;
  tuning: string; // tokens alphaTex, corda aguda → grave
};

export type InstrumentFamilyPreset = {
  key: string;
  label: string;
  isPercussion: boolean;
  /** Timbres GM disponíveis; o primeiro é o padrão. */
  sounds: InstrumentSound[];
  /** Opções de cordas; o primeiro é o padrão. Null = sem cordas (pauta padrão). */
  strings: InstrumentStrings[] | null;
};

export const INSTRUMENT_FAMILIES: InstrumentFamilyPreset[] = [
  {
    key: "guitar",
    label: "Guitarra",
    isPercussion: false,
    sounds: [
      { key: "clean", label: "limpa", program: 27 },
      { key: "overdrive", label: "overdrive", program: 29 },
      { key: "distortion", label: "distorção", program: 30 },
      { key: "jazz", label: "jazz", program: 26 },
    ],
    strings: [
      { count: 6, label: "6 cordas", tuning: "E4 B3 G3 D3 A2 E2" },
      { count: 7, label: "7 cordas", tuning: "E4 B3 G3 D3 A2 E2 B1" },
      { count: 8, label: "8 cordas", tuning: "E4 B3 G3 D3 A2 E2 B1 F#1" },
    ],
  },
  {
    key: "acoustic",
    label: "Violão",
    isPercussion: false,
    sounds: [
      { key: "steel", label: "aço", program: 25 },
      { key: "nylon", label: "náilon", program: 24 },
    ],
    strings: [
      { count: 6, label: "6 cordas", tuning: "E4 B3 G3 D3 A2 E2" },
      // Violão de 7 cordas brasileiro: as 6 padrão + C grave (choro/samba).
      { count: 7, label: "7 cordas", tuning: "E4 B3 G3 D3 A2 E2 C2" },
    ],
  },
  {
    key: "bass",
    label: "Baixo",
    isPercussion: false,
    sounds: [
      { key: "finger", label: "dedo", program: 33 },
      { key: "pick", label: "palheta", program: 34 },
      { key: "fretless", label: "fretless", program: 35 },
      { key: "slap", label: "slap", program: 36 },
    ],
    strings: [
      { count: 4, label: "4 cordas", tuning: "G2 D2 A1 E1" },
      { count: 5, label: "5 cordas", tuning: "G2 D2 A1 E1 B0" },
      { count: 6, label: "6 cordas", tuning: "C3 G2 D2 A1 E1 B0" },
    ],
  },
  {
    key: "keys",
    label: "Piano/Teclado",
    isPercussion: false,
    sounds: [
      { key: "piano", label: "piano acústico", program: 0 },
      { key: "epiano", label: "piano elétrico", program: 4 },
      { key: "organ", label: "órgão", program: 16 },
      { key: "synth", label: "sintetizador", program: 80 },
    ],
    strings: null,
  },
  {
    key: "vocals",
    label: "Vocal",
    isPercussion: false,
    sounds: [{ key: "voice", label: "voz", program: 52 }],
    strings: null,
  },
  {
    key: "drums",
    label: "Bateria",
    isPercussion: true,
    sounds: [{ key: "kit", label: "kit padrão", program: 0 }],
    strings: null,
  },
];

/** O que o cliente envia ao declarar: instrumento + características. */
export type DeclareSpec = {
  family: string;
  sound?: string; // key em family.sounds; ausente = padrão
  strings?: number; // count em family.strings; ausente = padrão
};

export type ResolvedInstrument = {
  familyKey: string;
  label: string; // rótulo pronto: "Guitarra 7 cordas (distorção)"
  program: number;
  tuning: string | null;
  isPercussion: boolean;
};

/**
 * Resolve a spec para o que o declareTrack grava. Puro e client-safe: a UI usa
 * para pré-visualizar o rótulo; o servidor, para validar e criar a trilha.
 * Lança em família/som/cordas desconhecidos.
 */
export function resolveInstrument(spec: DeclareSpec): ResolvedInstrument {
  const family = INSTRUMENT_FAMILIES.find((f) => f.key === spec.family);
  if (!family) throw new Error("Instrumento desconhecido.");

  const sound = spec.sound
    ? family.sounds.find((s) => s.key === spec.sound)
    : family.sounds[0];
  if (!sound) throw new Error("Timbre desconhecido para este instrumento.");

  let strings: InstrumentStrings | null = null;
  if (family.strings) {
    strings =
      spec.strings != null
        ? family.strings.find((s) => s.count === spec.strings) ?? null
        : family.strings[0];
    if (!strings) throw new Error("Número de cordas indisponível para este instrumento.");
  }

  // Rótulo: só o que foge do padrão vira sobrenome — "Guitarra", "Guitarra
  // 7 cordas", "Guitarra (overdrive)", "Violão (náilon)".
  let label = family.label;
  if (family.strings && strings && strings !== family.strings[0]) {
    label += ` ${strings.count} cordas`;
  }
  if (family.sounds.length > 1 && sound !== family.sounds[0]) {
    label += ` (${sound.label})`;
  }

  return {
    familyKey: family.key,
    label,
    program: sound.program,
    tuning: strings?.tuning ?? null,
    isPercussion: family.isPercussion,
  };
}

/** Chaves antigas da lista plana → spec equivalente (compat de API). */
export const LEGACY_PRESET_SPECS: Record<string, DeclareSpec> = {
  guitar: { family: "guitar" },
  guitar7: { family: "guitar", strings: 7 },
  acoustic: { family: "acoustic" },
  nylon: { family: "acoustic", sound: "nylon" },
  bass: { family: "bass" },
  bass5: { family: "bass", strings: 5 },
  piano: { family: "keys" },
  vocals: { family: "vocals" },
  drums: { family: "drums" },
};
