// Modelo da grade de percussão — os dados por trás do editor step-sequencer
// (DrumGridEditor). Percussão não cabe no modelo corda×casa da tablatura: aqui
// as linhas são peças do kit (bumbo, caixa, chimbal) e as colunas são
// subdivisões de tempo, como numa drum machine.
//
// Módulo puro (sem dependência do alphaTab); quem chama valida o documento
// remontado através do alphaTab.
//
// Um compasso é uma lista de TEMPOS (um por unidade do numerador da fórmula).
// Cada tempo é simples (subdividido em potências de dois) ou quiáltera (3 para
// 2), o que permite "chimbal reto nos tempos 1-3 e virada em tercina no 4" —
// impossível numa grade de resolução fixa. Cada célula guarda um conjunto de
// golpes, e cada golpe pode ter um modificador (acento, fantasma ou flam).
//
// Notação alphaTex de percussão: notas são números MIDI ou nomes de articulação
// entre aspas; acento `{ac}`, fantasma `{g}`, flam `{gr}`, quiáltera `{tu 3}`.

export type DrumPiece = { midi: number; label: string; short: string };

// Ordenadas como a pauta de bateria se lê: pratos em cima, bumbo embaixo.
export const DRUM_PIECES: DrumPiece[] = [
  { midi: 49, label: "Prato de ataque", short: "CC" },
  { midi: 57, label: "Prato de ataque 2", short: "CC2" },
  { midi: 55, label: "Splash", short: "SP" },
  { midi: 52, label: "China", short: "CN" },
  { midi: 51, label: "Prato de condução", short: "RD" },
  { midi: 53, label: "Condução (sino)", short: "RB" },
  { midi: 46, label: "Chimbal aberto", short: "HO" },
  { midi: 42, label: "Chimbal fechado", short: "HH" },
  { midi: 44, label: "Chimbal (pedal)", short: "HP" },
  { midi: 50, label: "Tom 1 (alto)", short: "T1" },
  { midi: 48, label: "Tom 2", short: "T2" },
  { midi: 47, label: "Tom 3", short: "T3" },
  { midi: 45, label: "Tom 4", short: "T4" },
  { midi: 43, label: "Surdo/tom grave", short: "T5" },
  { midi: 41, label: "Surdo grave", short: "T6" },
  { midi: 38, label: "Caixa", short: "CX" },
  { midi: 40, label: "Caixa elétrica", short: "CXe" },
  { midi: 37, label: "Caixa (aro)", short: "AR" },
  { midi: 39, label: "Palma", short: "PL" },
  { midi: 54, label: "Tamborim", short: "TM" },
  { midi: 56, label: "Cowbell", short: "CB" },
  { midi: 36, label: "Bumbo", short: "BD" },
  { midi: 35, label: "Bumbo 2", short: "BD2" },
];

/** Peças exibidas numa grade nova: o kit de rock comum, de cima para baixo. */
export const DEFAULT_LANES = [49, 51, 46, 42, 48, 45, 43, 38, 36];

export const PIECE_BY_MIDI = new Map(DRUM_PIECES.map((p) => [p.midi, p]));

// Inverso dos nomes de articulação que o AlphaTexExporter emite, para que uma
// trilha importada (ou editada em texto) volte para a grade sem perder golpes.
const NAME_TO_MIDI: Record<string, number> = {
  "Kick (hit)": 35,
  "Kick (hit) 2": 36,
  "Snare (side stick) 3": 37,
  "Snare (hit) 2": 38,
  "Hand Clap (hit)": 39,
  "Electric Snare (hit)": 40,
  "Low Floor Tom (hit)": 41,
  "Hi-Hat (closed)": 42,
  "Very Low Tom (hit)": 43,
  "Pedal Hi-Hat (hit)": 44,
  "Low Tom (hit)": 45,
  "Hi-Hat (open)": 46,
  "Mid Tom (hit)": 47,
  "High Tom (hit)": 48,
  "Crash high (hit)": 49,
  "High Floor Tom (hit)": 50,
  "Ride (middle)": 51,
  "China (hit)": 52,
  "Ride (bell)": 53,
  "Tambourine (hit)": 54,
  "Splash (hit)": 55,
  "Cowbell medium (hit)": 56,
  "Crash medium (hit)": 57,
  "Vibraslap (hit)": 58,
  "Ride (edge) 2": 59,
};

export type DrumResolution = 4 | 8 | 16 | 32;
export const RESOLUTIONS: { value: DrumResolution; label: string }[] = [
  { value: 4, label: "1/4" },
  { value: 8, label: "1/8" },
  { value: 16, label: "1/16" },
  { value: 32, label: "1/32" },
];

// Modificador de um golpe. Acento e fantasma são exclusivos entre si; flam é
// independente.
export type NoteMod = { accent?: boolean; ghost?: boolean; flam?: boolean };
export type Cell = Map<number, NoteMod>; // midi → modificador (chave = há golpe)
export type Beat = { triplet: boolean; cells: Cell[] };
// `prefix` = diretivas iniciais do compasso (\clef, \accidentals, \ks), que o
// exporter emite no 1º compasso de uma trilha materializada. A grade não as
// modela, mas as preserva opacas e reemite na serialização.
export type Bar = { beats: Beat[]; parseOk: boolean; prefix: string };

const TPW = 3840; // ticks por semibreve (divisível por 2·3, suporta quiálteras)

/** Células simples num tempo: quantas notas de valor `res` cabem em `1/tsDen`. */
export function straightCells(res: DrumResolution, tsDen: number): number {
  return res / tsDen;
}
/** Células de quiáltera num tempo: 3 para 2 da subdivisão simples. */
export function tripletCells(res: DrumResolution, tsDen: number): number {
  return (straightCells(res, tsDen) * 3) / 2;
}
/** Um tempo só admite quiáltera se sua subdivisão simples for par (≥ 1/8). */
export function canTriplet(res: DrumResolution, tsDen: number): boolean {
  const s = straightCells(res, tsDen);
  return s >= 2 && s % 2 === 0;
}
export function cellsInBeat(
  triplet: boolean,
  res: DrumResolution,
  tsDen: number,
): number {
  return triplet ? tripletCells(res, tsDen) : straightCells(res, tsDen);
}

/** Se a resolução divide o compasso em células inteiras (habilita a opção na UI). */
export function resolutionFits(
  tsNum: number,
  tsDen: number,
  res: DrumResolution,
): boolean {
  const s = straightCells(res, tsDen);
  return Number.isInteger(s) && s >= 1 && Number.isInteger(tsNum) && tsNum >= 1;
}

function emptyBeat(triplet: boolean, res: DrumResolution, tsDen: number): Beat {
  const n = cellsInBeat(triplet, res, tsDen);
  return { triplet, cells: Array.from({ length: n }, () => new Map()) };
}
export function emptyBar(tsNum: number, res: DrumResolution, tsDen: number): Bar {
  return {
    beats: Array.from({ length: tsNum }, () => emptyBeat(false, res, tsDen)),
    parseOk: true,
    prefix: "",
  };
}

// ── Tokenizing ───────────────────────────────────────────────────────────────

// Divide o alphaTex em tokens de nível superior, respeitando aspas ("Kick (hit)
// 2" é UM token) e grupos de parênteses/chaves ("(a b)", "{...}").
function splitTokens(tex: string): string[] {
  const tokens: string[] = [];
  let cur = "";
  let depth = 0;
  let inQuote = false;
  for (const ch of tex) {
    if (ch === '"') {
      inQuote = !inQuote;
      cur += ch;
      continue;
    }
    if (inQuote) {
      cur += ch;
      continue;
    }
    if (ch === "(" || ch === "{") depth++;
    else if (ch === ")" || ch === "}") depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) tokens.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur) tokens.push(cur);
  return tokens;
}

// Uma nota dentro de um acorde (ou solta): "36", "36{ac}", '"Snare (hit) 2"{g}'.
function parseNoteToken(s: string): { midi: number; mod: NoteMod } | null {
  let rest = s;
  let midi: number | null = null;
  const numM = rest.match(/^(\d+)/);
  if (numM) {
    midi = Number(numM[1]);
    rest = rest.slice(numM[1].length);
  } else {
    const nameM = rest.match(/^"([^"]+)"/);
    if (nameM && NAME_TO_MIDI[nameM[1]] != null) {
      midi = NAME_TO_MIDI[nameM[1]];
      rest = rest.slice(nameM[0].length);
    }
  }
  if (midi == null) return null;
  const mod: NoteMod = {};
  const brace = rest.match(/\{([^}]*)\}/);
  if (brace) {
    const props = brace[1].split(/\s+/);
    if (props.includes("ac") || props.includes("hac")) mod.accent = true;
    if (props.includes("g")) mod.ghost = true;
  }
  return { midi, mod };
}

type Event = {
  ticks: number;
  triplet: boolean;
  rest: boolean;
  pieces: { midi: number; mod: NoteMod }[];
  grace: boolean;
};

// Converte um token de golpe/pausa/grace num Event. null = não cabe na grade.
function parseBeatToken(tok: string, runDur: number | null): Event | null {
  let notePart: string;
  let after: string;
  if (tok.startsWith("(")) {
    const close = tok.lastIndexOf(")");
    if (close < 0) return null;
    notePart = tok.slice(1, close);
    after = tok.slice(close + 1);
  } else if (/^r\b|^r[.{]|^r$/i.test(tok)) {
    notePart = "r";
    after = tok.slice(1);
  } else {
    // Nota solta, possivelmente com ".dur" / "{...}".
    const m = tok.match(/^((?:\d+|"[^"]+")(?:\{[^}]*\})?)/);
    if (!m) return null;
    notePart = m[1];
    after = tok.slice(m[1].length);
  }
  const durM = after.match(/^\.(\d+)/);
  const dur = durM ? Number(durM[1]) : runDur;
  if (!dur) return null;
  const beatBrace = after.match(/\{([^}]*)\}/);
  const props = beatBrace ? beatBrace[1].split(/\s+/) : [];
  const triplet = props.includes("tu");
  const grace = props.includes("gr");
  const dotted = props.includes("d") || props.includes("dd");
  if (dotted) return null; // ritmo pontuado não cabe na grade — cai para texto

  let ticks = TPW / dur;
  if (triplet) ticks = (ticks * 2) / 3;

  const rest = notePart === "r";
  const pieces: { midi: number; mod: NoteMod }[] = [];
  if (!rest) {
    for (const p of splitTokens(notePart)) {
      const n = parseNoteToken(p);
      if (!n) return null;
      pieces.push(n);
    }
    if (pieces.length === 0) return null;
  }
  return { ticks, triplet, rest, pieces, grace };
}

/** Converte o alphaTex de percussão de um compasso na grade de tempos. Diante do
 *  que a grade não modela (pontuado, subdivisão mista num tempo, tokens
 *  desconhecidos) devolve `parseOk=false` e o editor cai para o modo texto. */
export function parseBar(
  tex: string,
  tsNum: number,
  tsDen: number,
  res: DrumResolution,
): Bar {
  const fail: Bar = { beats: [], parseOk: false, prefix: "" };

  // Diretivas iniciais (\clef, \accidentals, \ks) viram o prefixo opaco do
  // compasso. Um \voice indica vozes paralelas, que a grade não modela: o
  // compasso inteiro cai para o modo texto.
  const lines = tex.split(/\r?\n/);
  const prefixLines: string[] = [];
  let firstContent = 0;
  for (; firstContent < lines.length; firstContent++) {
    const lt = lines[firstContent].trim();
    if (lt === "") continue;
    if (!lt.startsWith("\\")) break;
    if (/^\\voice\b/.test(lt)) return fail;
    prefixLines.push(lt);
  }
  const prefix = prefixLines.join("\n");
  const body = lines.slice(firstContent).join("\n").trim();
  if (body === "") return { ...emptyBar(tsNum, res, tsDen), prefix };

  const tokens = splitTokens(body);
  const events: (Event & { start: number })[] = [];
  let runDur: number | null = null;
  let t = 0;
  let pendingGrace: { midi: number; mod: NoteMod }[] = [];
  for (const tok of tokens) {
    const dm = tok.match(/^:(\d+)$/);
    if (dm) {
      runDur = Number(dm[1]);
      continue;
    }
    if (tok === "|") continue;
    // Diretiva no meio do corpo: falha limpa em vez de pular o token e ler os
    // argumentos dela como se fossem notas.
    if (tok.startsWith("\\")) return fail;
    const ev = parseBeatToken(tok, runDur);
    if (!ev) return fail;
    if (ev.grace) {
      pendingGrace.push(...ev.pieces);
      continue; // grace não consome tempo do compasso
    }
    // Grace pendente vira flam no golpe correspondente.
    if (pendingGrace.length && !ev.rest) {
      for (const g of pendingGrace) {
        const hit = ev.pieces.find((p) => p.midi === g.midi) ?? ev.pieces[0];
        if (hit) hit.mod = { ...hit.mod, flam: true };
      }
    }
    pendingGrace = [];
    events.push({ ...ev, start: t });
    t += ev.ticks;
  }

  const beatTicks = TPW / tsDen;
  if (t !== beatTicks * tsNum) return fail; // não preenche o compasso

  // Segmenta os eventos em tempos, decidindo simples/quiáltera por tempo.
  const beats: Beat[] = [];
  for (let b = 0; b < tsNum; b++) {
    const beatStart = b * beatTicks;
    const inBeat = events.filter(
      (e) => e.start >= beatStart && e.start < beatStart + beatTicks,
    );
    const triplet = inBeat.some((e) => e.triplet);
    if (triplet && !canTriplet(res, tsDen)) return fail;
    const nCells = cellsInBeat(triplet, res, tsDen);
    const cellTicks = beatTicks / nCells;
    const cells: Cell[] = Array.from({ length: nCells }, () => new Map());
    for (const e of inBeat) {
      const off = e.start - beatStart;
      if (off % cellTicks !== 0) return fail;
      const idx = off / cellTicks;
      if (idx >= nCells) return fail;
      if (!e.rest) for (const p of e.pieces) cells[idx].set(p.midi, p.mod);
    }
    beats.push({ triplet, cells });
  }
  return { beats, parseOk: true, prefix };
}

// ── Serialização ─────────────────────────────────────────────────────────────

function modProps(mod: NoteMod): string {
  if (mod.accent) return "{ac}";
  if (mod.ghost) return "{g}";
  return "";
}

function serializeCell(cell: Cell, res: DrumResolution, triplet: boolean): string {
  const tu = triplet ? "{tu 3}" : "";
  if (cell.size === 0) return `r.${res}${tu}`;
  const midis = [...cell.keys()].sort((a, b) => a - b);
  const notes = midis.map((m) => `${m}${modProps(cell.get(m)!)}`);
  return `(${notes.join(" ")}).${res}${tu}`;
}

function serializeBeat(beat: Beat, res: DrumResolution): string {
  const out: string[] = [];
  for (const cell of beat.cells) {
    // Flam = uma grace note da mesma peça imediatamente antes do golpe.
    const flams = [...cell.keys()].filter((m) => cell.get(m)!.flam).sort((a, b) => a - b);
    if (flams.length) out.push(`(${flams.join(" ")}).${res}{gr}`);
    out.push(serializeCell(cell, res, beat.triplet));
  }
  return out.join(" ");
}

function barHasHits(bar: Bar): boolean {
  return bar.beats.some((b) => b.cells.some((c) => c.size > 0));
}

/** Serializa a grade de um compasso de volta para alphaTex de percussão.
 *  Compasso vazio devolve "", para que um slot declarado e intocado não conte
 *  como editado. Compasso só com diretivas opacas as mantém, acompanhadas de uma
 *  pausa inteira — mesma convenção que o assemble usa para células vazias. */
export function serializeBar(bar: Bar, res: DrumResolution): string {
  if (!barHasHits(bar)) return bar.prefix ? `${bar.prefix}\nr.1` : "";
  const body = bar.beats.map((b) => serializeBeat(b, res)).join(" ");
  return bar.prefix ? `${bar.prefix}\n${body}` : body;
}

/** Peças MIDI presentes num conjunto de compassos, para decidir linhas extras. */
export function midisInBars(bars: Bar[]): Set<number> {
  const s = new Set<number>();
  for (const bar of bars)
    for (const beat of bar.beats)
      for (const cell of beat.cells) for (const m of cell.keys()) s.add(m);
  return s;
}

/** Clone profundo de um compasso, base do clipboard e do undo. As células são
 *  Maps, então o spread raso deixaria as cópias compartilhando golpes. */
export function cloneBar(bar: Bar): Bar {
  return {
    parseOk: bar.parseOk,
    prefix: bar.prefix,
    beats: bar.beats.map((b) => ({
      triplet: b.triplet,
      cells: b.cells.map((c) => new Map(c)),
    })),
  };
}

/** Conforma um compasso copiado ao formato do destino, permitindo colar entre
 *  fórmulas de compasso e resoluções diferentes: os golpes são remapeados tempo
 *  a tempo, tempos faltantes nascem vazios e tempos extras são descartados.
 *  O prefixo sai vazio de propósito — diretiva é posicional e não viaja com o
 *  conteúdo copiado; quem chama mantém o prefixo do compasso de destino. */
export function conformBar(
  src: Bar,
  tsNum: number,
  tsDen: number,
  res: DrumResolution,
): Bar {
  const out = emptyBar(tsNum, res, tsDen);
  for (let b = 0; b < Math.min(tsNum, src.beats.length); b++) {
    const triplet = src.beats[b].triplet && canTriplet(res, tsDen);
    out.beats[b] = remapBeat(src.beats[b], triplet, res, tsDen);
  }
  return out;
}

/** True quando todo golpe do tempo cai exatamente na nova subdivisão, ou seja,
 *  `remapBeat` não moveria nada. Permite ao editor avisar antes de uma mudança
 *  de resolução que apagaria golpes. */
export function remapBeatIsLossless(
  beat: Beat,
  triplet: boolean,
  res: DrumResolution,
  tsDen: number,
): boolean {
  const nCells = cellsInBeat(triplet, res, tsDen);
  const old = beat.cells.length;
  return beat.cells.every((c, i) => c.size === 0 || (i * nCells) % old === 0);
}

/** Remapeia os golpes proporcionalmente quando a subdivisão do tempo muda
 *  (troca de resolução ou alternância simples↔quiáltera). */
export function remapBeat(
  beat: Beat,
  triplet: boolean,
  res: DrumResolution,
  tsDen: number,
): Beat {
  const nCells = cellsInBeat(triplet, res, tsDen);
  const cells: Cell[] = Array.from({ length: nCells }, () => new Map());
  const old = beat.cells.length;
  beat.cells.forEach((c, i) => {
    if (c.size === 0) return;
    const dst = Math.min(nCells - 1, Math.round((i / old) * nCells));
    for (const [m, mod] of c) cells[dst].set(m, mod);
  });
  return { triplet, cells };
}
