/**
 * alphatex-editor.ts — modelo interno do editor visual de tablatura.
 *
 * Módulo puro: zero dependências externas, zero DOM, sem "use client".
 * 100% testável no Node sem browser.
 *
 * Fluxo:
 *   parseTrackTex(tex)  → EditorModel
 *   <mutações>          → novo EditorModel (imutável)
 *   serializeModel(m)   → tex  (round-trip estável)
 */

// ── Tipos públicos ─────────────────────────────────────────────────────────────

export type NoteEffect = "b" | "h" | "p" | "sl" | "v";

export type EditorNote = {
  fret: number;    // 0–24
  string: number;  // 1 (corda mais aguda) … 6 (corda mais grave)
  effects: NoteEffect[];
};

export type EditorBeat = {
  duration: 1 | 2 | 4 | 8 | 16;
  notes: EditorNote[];  // vazio + isRest=true = silêncio; múltiplas = acorde
  isRest: boolean;
};

export type EditorMeasure = {
  beats: EditorBeat[];
};

export type EditorModel = {
  /** Reservado para extensões futuras (e.g. header de tempo/compasso). */
  header: string;
  measures: EditorMeasure[];
};

/** Posição do cursor de edição. null = sem seleção. */
export type EditorCursor = {
  measureIndex: number;
  beatIndex: number;
  string: number;  // corda selecionada (1–6)
} | null;

// ── Helpers internos ───────────────────────────────────────────────────────────

const VALID_DURATIONS = new Set<number>([1, 2, 4, 8, 16]);

function parseDuration(s: string): 1 | 2 | 4 | 8 | 16 | null {
  const n = parseInt(s, 10);
  return VALID_DURATIONS.has(n) ? (n as 1 | 2 | 4 | 8 | 16) : null;
}

/** Tokeniza o conteúdo de um compasso, respeitando grupos entre parênteses (acordes). */
function tokenizeMeasure(text: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const len = text.length;
  while (i < len) {
    // Pula espaços
    while (i < len && /\s/.test(text[i])) i++;
    if (i >= len) break;

    if (text[i] === "(") {
      // Acorde: lê até o ")"
      const j = text.indexOf(")", i);
      const end = j === -1 ? len : j + 1;
      tokens.push(text.slice(i, end));
      i = end;
    } else {
      // Token normal: lê até espaço
      let j = i;
      while (j < len && !/\s/.test(text[j])) j++;
      tokens.push(text.slice(i, j));
      i = j;
    }
  }
  return tokens;
}

/** Faz parse de um token de nota como "5.6", "12.3{h}", "0.1{sl}{v}", "5.6{b(100)}". */
function parseNoteToken(token: string): EditorNote | null {
  const noteMatch = token.match(/^(\d+)\.(\d+)/);
  if (!noteMatch) return null;

  const fret = parseInt(noteMatch[1], 10);
  const string = parseInt(noteMatch[2], 10);
  if (isNaN(fret) || isNaN(string)) return null;

  const effects: NoteEffect[] = [];
  // Ex.: {b(100)} → strip parâmetros → "b"
  const effectRe = /\{([^}]+)\}/g;
  let em: RegExpExecArray | null;
  while ((em = effectRe.exec(token)) !== null) {
    const raw = em[1].replace(/\(.*\)/, "").toLowerCase();
    if (raw === "h" || raw === "p" || raw === "sl" || raw === "v" || raw === "b") {
      effects.push(raw as NoteEffect);
    }
  }

  return { fret, string, effects };
}

/** Faz parse de um token de acorde como "(5.6 7.5 9.4)". */
function parseChordToken(token: string): EditorNote[] {
  const inner = token.replace(/^\(|\)$/g, "").trim();
  if (!inner) return [];
  return inner
    .split(/\s+/)
    .map(parseNoteToken)
    .filter((n): n is EditorNote => n !== null);
}

// ── Clone profundo (imutabilidade) ─────────────────────────────────────────────

function cloneModel(model: EditorModel): EditorModel {
  return {
    header: model.header,
    measures: model.measures.map((m) => ({
      beats: m.beats.map((b) => ({
        duration: b.duration,
        isRest: b.isRest,
        notes: b.notes.map((n) => ({ ...n, effects: [...n.effects] })),
      })),
    })),
  };
}

// ── Parser ─────────────────────────────────────────────────────────────────────

/**
 * Converte o alphaTex de uma trilha (ex.: ":4 5.6 7.6 | r r |") em EditorModel.
 * O alphaTex de trilha é apenas o conteúdo dos compassos — sem \title, sem \track.
 */
export function parseTrackTex(tex: string): EditorModel {
  const measureStrings = tex.split("|");
  let currentDuration: 1 | 2 | 4 | 8 | 16 = 4;
  const measures: EditorMeasure[] = [];

  for (const raw of measureStrings) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const tokens = tokenizeMeasure(trimmed);
    const beats: EditorBeat[] = [];

    for (const token of tokens) {
      if (token.startsWith(":")) {
        const d = parseDuration(token.slice(1));
        if (d !== null) currentDuration = d;
      } else if (token === "r") {
        beats.push({ duration: currentDuration, notes: [], isRest: true });
      } else if (token.startsWith("(")) {
        const notes = parseChordToken(token);
        if (notes.length > 0) {
          beats.push({ duration: currentDuration, notes, isRest: false });
        }
      } else {
        const note = parseNoteToken(token);
        if (note) {
          beats.push({ duration: currentDuration, notes: [note], isRest: false });
        }
      }
    }

    if (beats.length > 0) {
      measures.push({ beats });
    }
  }

  return { header: "", measures };
}

// ── Serializer ─────────────────────────────────────────────────────────────────

function serializeNote(note: EditorNote): string {
  let s = `${note.fret}.${note.string}`;
  for (const e of note.effects) s += `{${e}}`;
  return s;
}

/**
 * Converte EditorModel de volta para alphaTex de trilha.
 * Emite ":DURATION" apenas quando a duração muda.
 * Compassos separados por " |\n".
 */
export function serializeModel(model: EditorModel): string {
  const measureParts: string[] = [];
  let prevDuration: 1 | 2 | 4 | 8 | 16 = 4;

  for (const measure of model.measures) {
    const beatParts: string[] = [];

    for (const beat of measure.beats) {
      let part = "";
      if (beat.duration !== prevDuration) {
        part += `:${beat.duration} `;
        prevDuration = beat.duration;
      }
      if (beat.isRest || beat.notes.length === 0) {
        part += "r";
      } else if (beat.notes.length === 1) {
        part += serializeNote(beat.notes[0]);
      } else {
        part += `(${beat.notes.map(serializeNote).join(" ")})`;
      }
      beatParts.push(part);
    }

    measureParts.push(beatParts.join(" "));
  }

  return measureParts.join(" |\n");
}

// ── Mutações (todas retornam novo EditorModel) ─────────────────────────────────

/**
 * Define/atualiza a casa de uma nota numa corda específica de um beat.
 * Se a nota na corda ainda não existe, cria-a.
 */
export function setNote(
  model: EditorModel,
  measureIndex: number,
  beatIndex: number,
  string: number,
  fret: number,
): EditorModel {
  const next = cloneModel(model);
  const beat = next.measures[measureIndex]?.beats[beatIndex];
  if (!beat) return model;

  beat.isRest = false;
  const existing = beat.notes.find((n) => n.string === string);
  if (existing) {
    existing.fret = fret;
  } else {
    beat.notes.push({ fret, string, effects: [] });
    beat.notes.sort((a, b) => a.string - b.string);
  }
  return next;
}

/** Remove a nota de uma corda específica num beat. Se ficar sem notas, vira rest. */
export function deleteNote(
  model: EditorModel,
  measureIndex: number,
  beatIndex: number,
  string: number,
): EditorModel {
  const next = cloneModel(model);
  const beat = next.measures[measureIndex]?.beats[beatIndex];
  if (!beat) return model;

  beat.notes = beat.notes.filter((n) => n.string !== string);
  if (beat.notes.length === 0) beat.isRest = true;
  return next;
}

/** Transforma um beat em silêncio (rest), descartando todas as notas. */
export function setRest(
  model: EditorModel,
  measureIndex: number,
  beatIndex: number,
): EditorModel {
  const next = cloneModel(model);
  const beat = next.measures[measureIndex]?.beats[beatIndex];
  if (!beat) return model;

  beat.notes = [];
  beat.isRest = true;
  return next;
}

/** Altera a duração de um beat. */
export function setBeatDuration(
  model: EditorModel,
  measureIndex: number,
  beatIndex: number,
  duration: 1 | 2 | 4 | 8 | 16,
): EditorModel {
  const next = cloneModel(model);
  const beat = next.measures[measureIndex]?.beats[beatIndex];
  if (!beat) return model;

  beat.duration = duration;
  return next;
}

/**
 * Insere um novo beat (rest) após `afterBeatIndex` no compasso.
 * A duração do novo beat herda a do beat de referência.
 */
export function insertBeat(
  model: EditorModel,
  measureIndex: number,
  afterBeatIndex: number,
): EditorModel {
  const next = cloneModel(model);
  const measure = next.measures[measureIndex];
  if (!measure) return model;

  const refDuration = measure.beats[afterBeatIndex]?.duration ?? 4;
  const newBeat: EditorBeat = { duration: refDuration, notes: [], isRest: true };
  measure.beats.splice(afterBeatIndex + 1, 0, newBeat);
  return next;
}

/**
 * Remove um beat do compasso.
 * Garante que o compasso nunca fique vazio (mínimo 1 beat).
 */
export function deleteBeat(
  model: EditorModel,
  measureIndex: number,
  beatIndex: number,
): EditorModel {
  const next = cloneModel(model);
  const measure = next.measures[measureIndex];
  if (!measure || measure.beats.length <= 1) return model;

  measure.beats.splice(beatIndex, 1);
  return next;
}

/** Ativa/desativa um efeito na nota de uma corda específica num beat. */
export function toggleEffect(
  model: EditorModel,
  measureIndex: number,
  beatIndex: number,
  string: number,
  effect: NoteEffect,
): EditorModel {
  const next = cloneModel(model);
  const beat = next.measures[measureIndex]?.beats[beatIndex];
  if (!beat) return model;

  const note = beat.notes.find((n) => n.string === string);
  if (!note) return model;

  const idx = note.effects.indexOf(effect);
  if (idx === -1) {
    note.effects.push(effect);
  } else {
    note.effects.splice(idx, 1);
  }
  return next;
}
