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
 *
 * IMPORTANTE — dialeto do alphaTex que recebemos.
 * O conteúdo de trilha vem das CÉLULAS materializadas, que por sua vez vêm do
 * `AlphaTexExporter` do alphaTab (ver materialize.ts / alphatex-grid.ts). Esse
 * exportador usa um dialeto específico:
 *   - **um beat por linha**;
 *   - **duração inline por beat**: nota = `casa.corda.duração` (ex. `2.3.8`),
 *     pausa = `r.duração` (ex. `r.1`), acorde = `(c.s c.s).duração` (ex. `(0.2 0.3).8`);
 *   - **anotações entre chaves** que CONTÊM ESPAÇOS: `{lyrics (0 "There's") dy mp}`,
 *     `{ch "Am"}`, `{dy mf instrument tenorsax}` — letra, dinâmica, nome de acorde…;
 *   - **diretivas de compasso** em linhas próprias: `\clef g2`, `\ks c`, `\ottava`,
 *     `\simile`, `\barLineRight lightlight`, e o separador de vozes `\voice`.
 *
 * Por isso o tokenizador é **ciente de chaves/parênteses e de linhas** (espaços
 * dentro de `{}`/`()` NÃO separam tokens), as durações são lidas/escritas inline,
 * e tudo que o editor não modela é **preservado opaco** (suffix da nota, prefix de
 * diretivas do compasso, tail das vozes extras). Assim o round-trip não destrói
 * pausas, durações, letras nem acordes — o bug que motivou esta versão.
 *
 * O dialeto "escrito à mão" (`:4 5.6 7.6` com duração sticky e vários beats por
 * linha) também é aceito na leitura (seed/modo texto), mas a escrita sempre
 * normaliza para o formato inline do exportador.
 */

// ── Tipos públicos ─────────────────────────────────────────────────────────────

/** Durações suportadas (semibreve → semifusa). 32/64 aparecem em solos reais. */
export type BeatDuration = 1 | 2 | 4 | 8 | 16 | 32 | 64;

/**
 * Efeitos de nota EDITÁVEIS por toggle — todos sem parâmetros, então o round-trip
 * é sem perda (o AlphaTexExporter emite exatamente estes tokens: `x` = nota
 * morta/abafada, `pm` = palm mute, `nh` = harmônico natural, `ac`/`hac` = acento,
 * `st` = staccato, `g` = ghost note). Bend (`b`) fica fora de propósito: precisa
 * de pontos (`{b (0 4)}`) → tem API própria (noteBendQuarters/setBend) e mora em
 * `note.suffix`; bends importados com curva real (`be …`) são preservados opacos.
 */
export type NoteEffect =
  | "h" | "p" | "sl" | "v" | "lr"
  | "x" | "pm" | "nh" | "ac" | "hac" | "st" | "g";

const NOTE_EFFECTS = new Set<NoteEffect>([
  "h", "p", "sl", "v", "lr", "x", "pm", "nh", "ac", "hac", "st", "g",
]);

export type EditorNote = {
  fret: number;    // 0–24
  string: number;  // 1 (corda mais aguda) … 6 (corda mais grave)
  effects: NoteEffect[];
  /**
   * Efeitos/anotações de NOTA opacos, preservados verbatim. No alphaTex eles vêm
   * ENTRE `casa.corda` e `.duração` (ex.: `3.2{t}.8` → o `{t}` de ligadura, `{lr}`
   * de let-ring). Reescrever isso DEPOIS da duração quebra o parser (vira propriedade
   * de beat inválida) — daí a distinção nota-antes / beat-depois.
   */
  suffix?: string;
};

export type EditorBeat = {
  duration: BeatDuration;
  notes: EditorNote[];  // vazio + isRest=true = silêncio; múltiplas = acorde
  isRest: boolean;
  /**
   * Anotações de BEAT opacas, que vêm DEPOIS da `.duração`, preservadas verbatim:
   * letra, dinâmica, nome de acorde, etc. Ex.: `{lyrics (0 "a")}{dy mp}`, `{ch "Am"}`.
   * (Efeitos de nota ficam em `note.suffix`, antes da duração.)
   */
  suffix?: string;
};

export type EditorMeasure = {
  beats: EditorBeat[];
  /**
   * True quando o compasso veio de uma célula vazia (sem contribuição no servidor).
   * Faz `serializeModel` round-tripar como "" em vez de "r", para `submitTrackContent`
   * pular (body === "") e não criar contribuições de ruído em compassos intocados.
   */
  wasEmpty?: boolean;
  /**
   * Linhas de diretiva de compasso ANTES do primeiro beat (ex.: `\clef g2`,
   * `\ks c`, `\barLineRight lightlight`). Preservadas verbatim.
   */
  prefix?: string;
  /**
   * Conteúdo a partir do primeiro `\voice` (ou diretiva após os beats) até o fim
   * do compasso. Preserva as vozes 1+ opacas — o editor edita só a voz 0 (MVP).
   */
  tail?: string;
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

const VALID_DURATIONS = new Set<number>([1, 2, 4, 8, 16, 32, 64]);

function parseDuration(s: string): BeatDuration | null {
  const n = parseInt(s, 10);
  return VALID_DURATIONS.has(n) ? (n as BeatDuration) : null;
}

/**
 * Divide UMA linha em tokens de beat, mantendo `(...)` e `{...}` (e seus espaços
 * internos) intactos. Cobre os dois dialetos: uma linha com vários beats
 * (`:4 5.6 7.6`, escrito à mão) e uma linha com um beat rico do exportador
 * (`2.3.8{lyrics (0 "x") dy mp}`).
 */
function splitBeatTokens(line: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of line) {
    if (ch === "(" || ch === "{") {
      depth++;
      cur += ch;
    } else if (ch === ")" || ch === "}") {
      depth = Math.max(0, depth - 1);
      cur += ch;
    } else if (/\s/.test(ch) && depth === 0) {
      if (cur) {
        tokens.push(cur);
        cur = "";
      }
    } else {
      cur += ch;
    }
  }
  if (cur) tokens.push(cur);
  return tokens;
}

/** Lê grupos de chaves `{...}{...}` consecutivos a partir de `i`. */
function readBraceGroups(s: string, i: number): { groups: string; next: number } {
  let out = "";
  while (i < s.length && s[i] === "{") {
    let depth = 0;
    let j = i;
    for (; j < s.length; j++) {
      if (s[j] === "{") depth++;
      else if (s[j] === "}") {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
    }
    out += s.slice(i, j);
    i = j;
  }
  return { groups: out, next: i };
}

/** Lê uma duração `.N` a partir de `i`, se houver; senão devolve o fallback sticky. */
function readDuration(
  s: string,
  i: number,
  fallback: BeatDuration,
): { duration: BeatDuration; next: number } {
  if (s[i] === ".") {
    let j = i + 1;
    while (j < s.length && /\d/.test(s[j])) j++;
    const d = parseDuration(s.slice(i + 1, j));
    if (d !== null) return { duration: d, next: j };
  }
  return { duration: fallback, next: i };
}

/** Acha o índice do `)` que fecha o `(` inicial, respeitando chaves aninhadas. */
function findChordClose(t: string): number {
  let parenDepth = 0;
  let braceDepth = 0;
  for (let k = 0; k < t.length; k++) {
    const ch = t[k];
    if (ch === "{") braceDepth++;
    else if (ch === "}") braceDepth = Math.max(0, braceDepth - 1);
    else if (braceDepth === 0 && ch === "(") parenDepth++;
    else if (braceDepth === 0 && ch === ")") {
      parenDepth--;
      if (parenDepth === 0) return k;
    }
  }
  return -1;
}

/** Divide um sufixo "{...}{...}" nos seus grupos de chaves de nível superior. */
function splitBraceGroups(suffix: string): string[] {
  const groups: string[] = [];
  let i = 0;
  while (i < suffix.length) {
    if (suffix[i] === "{") {
      let depth = 0;
      let j = i;
      for (; j < suffix.length; j++) {
        if (suffix[j] === "{") depth++;
        else if (suffix[j] === "}") {
          depth--;
          if (depth === 0) {
            j++;
            break;
          }
        }
      }
      groups.push(suffix.slice(i, j));
      i = j;
    } else {
      i++; // caractere solto entre grupos (não esperado) — ignora
    }
  }
  return groups;
}

/**
 * Propriedades de nota cujo PARÂMETRO é um ident/número solto (não entre
 * parênteses): um token de efeito logo depois delas é argumento, não efeito.
 * (Args entre parênteses viram um token "(...)", que nunca colide.)
 */
const PARAM_KEYWORDS = new Set(["slur", "acc", "lf", "rf"]);

/**
 * Separa efeitos editáveis (extraídos) das anotações opacas (preservadas).
 * CIENTE DE TOKENS: o exporter (e o nosso serializer) escrevem TODAS as
 * propriedades da nota num único grupo `{v pm x}` — classificar grupo a grupo
 * perdia o estado dos toggles (e duplicava efeitos ao reeditar). Os tokens não
 * reconhecidos são re-unidos num único grupo opaco, na ordem original.
 */
function extractEffectsAndSuffix(rawSuffix: string): {
  effects: NoteEffect[];
  suffix: string;
} {
  if (!rawSuffix) return { effects: [], suffix: "" };
  const effects: NoteEffect[] = [];
  const kept: string[] = [];
  for (const g of splitBraceGroups(rawSuffix)) {
    const tokens = splitTopLevelTokens(g.slice(1, -1));
    for (let i = 0; i < tokens.length; i++) {
      const lt = tokens[i].toLowerCase();
      const prev = i > 0 ? tokens[i - 1].toLowerCase() : "";
      if (
        NOTE_EFFECTS.has(lt as NoteEffect) &&
        !PARAM_KEYWORDS.has(prev) &&
        !effects.includes(lt as NoteEffect)
      ) {
        effects.push(lt as NoteEffect);
      } else {
        kept.push(tokens[i]);
      }
    }
  }
  return { effects, suffix: kept.length ? `{${kept.join(" ")}}` : "" };
}

/**
 * Parse de uma nota individual: `casa.corda` seguida de efeitos de NOTA opcionais
 * (`{t}`, `{lr}`, `{h}`…). Usado para notas soltas e para cada nota de um acorde.
 */
function parseNoteCoreToNote(token: string): EditorNote | null {
  const m = token.match(/^(\d+)\.(\d+)/);
  if (!m) return null;
  const fret = parseInt(m[1], 10);
  const string = parseInt(m[2], 10);
  if (isNaN(fret) || isNaN(string)) return null;
  const { groups } = readBraceGroups(token, m[0].length);
  const { effects, suffix } = extractEffectsAndSuffix(groups);
  return { fret, string, effects, suffix: suffix || undefined };
}

/**
 * Parse de um token de beat completo. Respeita a gramática alphaTex
 * `casa.corda{efeitosDeNota}.duração{efeitosDeBeat}` — efeitos de nota vêm ANTES
 * da duração, efeitos de beat DEPOIS. Aceita também o dialeto sticky escrito à mão
 * (sem `.duração` inline → usa `currentDuration`). Retorna o beat e a próxima
 * duração sticky (= a duração inline lida, se houver).
 */
function parseBeatToken(
  token: string,
  currentDuration: BeatDuration,
): { beat: EditorBeat; nextDuration: BeatDuration } | null {
  const t = token.trim();
  if (!t) return null;

  // Pausa: "r", "r.N", "r.N{efeitosDeBeat}" (sem efeitos de nota)
  if (t === "r" || t.startsWith("r.") || t.startsWith("r{")) {
    const pre = readBraceGroups(t, 1); // chaves antes da duração (raro) → beat
    const dur = readDuration(t, pre.next, currentDuration);
    const post = readBraceGroups(t, dur.next);
    const suffix = (pre.groups + post.groups) || undefined;
    return {
      beat: { duration: dur.duration, notes: [], isRest: true, suffix },
      nextDuration: dur.duration,
    };
  }

  // Acorde: "(nota nota).duração{efeitosDeBeat}"
  if (t.startsWith("(")) {
    const close = findChordClose(t);
    if (close === -1) return null;
    const inner = t.slice(1, close);
    const dur = readDuration(t, close + 1, currentDuration);
    const suffix = readBraceGroups(t, dur.next).groups || undefined;
    const notes = splitBeatTokens(inner)
      .map(parseNoteCoreToNote)
      .filter((n): n is EditorNote => n !== null);
    if (notes.length === 0) return null;
    return {
      beat: { duration: dur.duration, notes, isRest: false, suffix },
      nextDuration: dur.duration,
    };
  }

  // Nota simples: "casa.corda{efeitosDeNota}.duração{efeitosDeBeat}"
  const m = t.match(/^(\d+)\.(\d+)/);
  if (!m) return null;
  const fret = parseInt(m[1], 10);
  const string = parseInt(m[2], 10);
  if (isNaN(fret) || isNaN(string)) return null;

  const noteBraces = readBraceGroups(t, m[0].length); // efeitos de NOTA (antes da duração)
  const dur = readDuration(t, noteBraces.next, currentDuration);
  const beatBraces = readBraceGroups(t, dur.next).groups; // efeitos de BEAT (depois)

  const { effects, suffix: noteSuffix } = extractEffectsAndSuffix(noteBraces.groups);
  return {
    beat: {
      duration: dur.duration,
      notes: [{ fret, string, effects, suffix: noteSuffix || undefined }],
      isRest: false,
      suffix: beatBraces || undefined,
    },
    nextDuration: dur.duration,
  };
}

// ── Clone profundo (imutabilidade) ─────────────────────────────────────────────

function cloneBeat(b: EditorBeat): EditorBeat {
  return {
    duration: b.duration,
    isRest: b.isRest,
    suffix: b.suffix,
    notes: b.notes.map((n) => ({ ...n, effects: [...n.effects] })),
    // (note.suffix é copiado pelo spread acima)
  };
}

/** Clone profundo de uma lista de beats — base do clipboard de copiar/colar. */
export function cloneBeats(beats: EditorBeat[]): EditorBeat[] {
  return beats.map(cloneBeat);
}

function cloneModel(model: EditorModel): EditorModel {
  return {
    header: model.header,
    measures: model.measures.map((m) => ({
      wasEmpty: m.wasEmpty,
      prefix: m.prefix,
      tail: m.tail,
      beats: cloneBeats(m.beats),
    })),
  };
}

// ── Parser ─────────────────────────────────────────────────────────────────────

/**
 * Converte o alphaTex de uma trilha em EditorModel.
 * O alphaTex de trilha é apenas o conteúdo dos compassos (separados por "|") —
 * sem \title, sem \track. Cada `|`-segmento vira EXATAMENTE um compasso, para
 * o número de compassos casar com o que `submitTrackContent` espera.
 */
export function parseTrackTex(tex: string): EditorModel {
  const segments = tex.split("|");
  let currentDuration: BeatDuration = 4;
  const measures: EditorMeasure[] = [];

  for (const segment of segments) {
    // Segmento vazio = célula sem contribuição no servidor. NÃO pode ser descartado:
    // o compasso existe no banco e conta no total. Placeholder com uma pausa INTEIRA
    // (r.1, como o assemble faz) mantém o índice e a duração do compasso; wasEmpty
    // faz o serializer round-tripar como "".
    if (!segment.trim()) {
      measures.push({
        wasEmpty: true,
        beats: [{ duration: 1, notes: [], isRest: true }],
      });
      continue;
    }

    const prefix: string[] = [];
    const tail: string[] = [];
    const beats: EditorBeat[] = [];
    let phase: "prefix" | "beats" | "tail" = "prefix";

    for (const rawLine of segment.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;

      // Diretiva de compasso / separador de voz: preservada verbatim.
      if (line.startsWith("\\")) {
        if (phase === "prefix") {
          prefix.push(line);
        } else {
          // \voice ou diretiva após os beats → daqui em diante tudo é tail opaco.
          phase = "tail";
          tail.push(line);
        }
        continue;
      }

      // Linha de beat já dentro do tail (após \voice): preserva crua.
      if (phase === "tail") {
        tail.push(line);
        continue;
      }

      phase = "beats";
      for (const token of splitBeatTokens(line)) {
        if (token.startsWith(":")) {
          // Duração sticky (dialeto escrito à mão).
          const d = parseDuration(token.slice(1));
          if (d !== null) currentDuration = d;
          continue;
        }
        const parsed = parseBeatToken(token, currentDuration);
        if (parsed) {
          beats.push(parsed.beat);
          currentDuration = parsed.nextDuration;
        }
      }
    }

    measures.push({
      beats,
      prefix: prefix.length ? prefix.join("\n") : undefined,
      tail: tail.length ? tail.join("\n") : undefined,
    });
  }

  return { header: "", measures };
}

// ── Serializer ─────────────────────────────────────────────────────────────────

/**
 * Serializa uma nota: `casa.corda{prop prop …}` (tudo ANTES da duração).
 * IMPORTANTE: o alphaTab aceita só UM bloco `{}` por nota — várias propriedades
 * vão separadas por espaço DENTRO do mesmo bloco. Emitir `{lr}{v}` (blocos
 * separados) é rejeitado. Por isso unimos efeitos editáveis + anotações opacas de
 * nota num único grupo.
 */
function serializeNote(n: EditorNote): string {
  const props: string[] = [...n.effects];
  if (n.suffix) {
    for (const g of splitBraceGroups(n.suffix)) {
      const inner = g.slice(1, -1).trim(); // conteúdo sem as chaves
      if (inner) props.push(inner);
    }
  }
  const base = `${n.fret}.${n.string}`;
  return props.length ? `${base}{${props.join(" ")}}` : base;
}

/**
 * Serializa um beat no formato inline do exportador (duração sempre explícita),
 * respeitando a gramática `casa.corda{efeitosDeNota}.duração{efeitosDeBeat}`.
 */
function serializeBeat(beat: EditorBeat): string {
  if (beat.isRest || beat.notes.length === 0) {
    return `r.${beat.duration}${beat.suffix ?? ""}`;
  }
  if (beat.notes.length === 1) {
    // Efeitos/sufixo de nota ANTES da duração; sufixo de beat DEPOIS.
    return `${serializeNote(beat.notes[0])}.${beat.duration}${beat.suffix ?? ""}`;
  }
  const inner = beat.notes.map(serializeNote).join(" ");
  return `(${inner}).${beat.duration}${beat.suffix ?? ""}`;
}

/** Um compasso wasEmpty que continua sem conteúdo real → round-trip como "". */
function isStillEmpty(m: EditorMeasure): boolean {
  if (!m.wasEmpty || m.prefix || m.tail) return false;
  if (m.beats.length === 0) return true;
  if (m.beats.length > 1) return false;
  const b = m.beats[0];
  return b.isRest && b.notes.length === 0 && !b.suffix;
}

/**
 * Converte EditorModel de volta para alphaTex de trilha.
 * Emite UM segmento por compasso, separados por " |\n" (espelhando o split por "|"
 * de `submitTrackContent`). Duração sempre inline; anotações/diretivas/vozes
 * preservadas verbatim.
 */
export function serializeModel(model: EditorModel): string {
  const segments = model.measures.map((m) => {
    if (isStillEmpty(m)) return "";
    const parts: string[] = [];
    if (m.prefix) parts.push(m.prefix);
    for (const b of m.beats) parts.push(serializeBeat(b));
    if (m.tail) parts.push(m.tail);
    return parts.join("\n");
  });

  return segments.join(" |\n");
}

// ── Serialização para RENDER (documento alphaTex real, só para o alphaTab) ─────
//
// O formato de SUBMISSÃO (serializeModel) guarda as vozes extras dentro de cada
// compasso ("beats \voice tail | …") porque é o formato das CÉLULAS — o servidor
// só divide por "|" e o assemble transpõe. Mas esse texto NÃO é alphaTex válido
// para renderizar direto: um "\voice" por compasso cria masterbars extras
// (comprovado: 3 bars em vez de 2) — era isso que deslocava a seleção.
// Para o render é preciso TRANSPOR (voz externa, compasso interno), igual ao
// assembleFromNormalized, e opcionalmente incluir o header real da trilha
// (afinação/instrumento) e os prefixos estruturais por compasso (\ts, \tempo…).

/** Separa o tail em: sufixo da voz 0 (antes do 1º \voice) + conteúdo das vozes 1+. */
function splitTailVoices(tail: string | undefined): { v0suffix: string; voices: string[] } {
  if (!tail) return { v0suffix: "", voices: [] };
  const chunks: string[][] = [[]];
  for (const line of tail.split(/\r?\n/)) {
    if (/^\\voice\b/.test(line.trim())) chunks.push([]);
    else chunks[chunks.length - 1].push(line);
  }
  const [first, ...rest] = chunks;
  const joinClean = (ls: string[]) => ls.filter((l) => l.trim()).join("\n");
  return { v0suffix: joinClean(first), voices: rest.map(joinClean) };
}

export type RenderContext = {
  /** Track.headerFragment do banco (\track/\staff/\tuning…) — dá afinação e
   *  nº de cordas reais. Sem ele o alphaTab assume guitarra 6 cordas. */
  trackHeader?: string | null;
  /** Measure.structPrefix por compasso (\ts, \tempo, \section…) — dá fórmula de
   *  compasso e andamento reais, alinhando os ticks com a música completa. */
  structPrefixes?: (string | null | undefined)[];
  /** Andamento inicial da música (bpm). O tempo inicial mora no header GLOBAL
   *  do documento (não no header da trilha) — sem isto o editor não desenharia
   *  a marca ♩=N do compasso 1. Ignorado se o compasso 1 já tem \tempo próprio. */
  initialTempo?: number | null;
};

/**
 * Serializa o modelo como um documento alphaTex de UMA trilha, renderizável:
 * vozes transpostas (voz externa, compasso interno), compassos vazios como pausa
 * inteira, header/structs reais quando fornecidos. Mesmo nº de masterbars que a
 * música completa → índices de clique e ticks de playback batem 1:1.
 */
export function serializeForRender(model: EditorModel, ctx?: RenderContext): string {
  const tails = model.measures.map((m) => splitTailVoices(m.tail));
  const nVoices = Math.max(1, ...tails.map((t) => t.voices.length + 1));
  const out: string[] = [];
  const struct0 = ctx?.structPrefixes?.[0] ?? "";
  if (ctx?.initialTempo && !/\\tempo\b/i.test(struct0)) {
    // Metadado GLOBAL exige o terminador "." antes da notação começar.
    out.push(`\\tempo ${ctx.initialTempo}`, ".");
  }
  const header = ctx?.trackHeader?.trim();
  if (header) out.push(header);

  for (let v = 0; v < nVoices; v++) {
    if (v > 0) out.push("\\voice");
    model.measures.forEach((m, i) => {
      let chunk: string;
      if (v === 0) {
        const parts: string[] = [];
        const struct = ctx?.structPrefixes?.[i];
        if (struct && struct.trim()) parts.push(struct);
        if (m.prefix) parts.push(m.prefix);
        const beats = m.beats.map(serializeBeat);
        parts.push(...(beats.length ? beats : ["r.1"]));
        if (tails[i].v0suffix) parts.push(tails[i].v0suffix);
        chunk = parts.join("\n");
      } else {
        chunk = tails[i].voices[v - 1] || "r.1";
      }
      out.push(chunk);
      if (i < model.measures.length - 1) out.push("|");
    });
  }
  return out.join("\n");
}

// ── Capacidade do compasso (noção de fórmula de compasso) ──────────────────────
// Unidade: 1/64 de semibreve. Pode ser fracionário: pontuados (×1.5/×1.75) e
// quiálteras (ex. ×2/3) vêm das anotações de beat — sem eles, metade dos
// compassos importados leria "fora do tempo" falsamente.

/** Palavras "nuas" de um grupo {…}: ignora conteúdo entre aspas e parênteses
 *  (letra de música, parâmetros) para não confundir "d" de lyrics com pontuado. */
function bareWords(inner: string): string[] {
  const words: string[] = [];
  let cur = "";
  let depth = 0;
  let inStr = false;
  for (const ch of inner) {
    if (inStr) {
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "(") { depth++; continue; }
    if (ch === ")") { depth = Math.max(0, depth - 1); continue; }
    if (depth > 0) continue;
    if (/\s/.test(ch)) {
      if (cur) { words.push(cur); cur = ""; }
    } else {
      cur += ch;
    }
  }
  if (cur) words.push(cur);
  return words;
}

// Denominador padrão de quiáltera por N (alphaTab): 3:2, 5:4, 6:4, 7:4, 9:8…
const TUPLET_DEN: Record<number, number> = {
  3: 2, 5: 4, 6: 4, 7: 4, 9: 8, 10: 8, 11: 8, 12: 8, 13: 8,
};

/**
 * Fator de duração do beat vindo das anotações:
 * pontuado {d}=×1.5 / {dd}=×1.75; quiáltera {tu N}=den(N)/N ou {tu (N M)}=M/N;
 * grace note {gr …}=×0 (não ocupa tempo do compasso).
 */
function beatDurationFactor(suffix: string | undefined): number {
  if (!suffix) return 1;
  let factor = 1;
  for (const g of splitBraceGroups(suffix)) {
    // Strings (letra, nomes) fora da jogada — "d"/"tu" dentro de aspas não conta.
    let inner = g.slice(1, -1).replace(/"[^"]*"/g, '""');
    // Quiáltera com razão explícita: tu (N M) = N no tempo de M.
    inner = inner.replace(/(^|\s)tu\s*\(\s*(\d+)\s+(\d+)\s*\)/g, (_m, pre, n, den) => {
      factor *= Number(den) / Number(n);
      return pre;
    });
    // Quiáltera simples: tu N (denominador padrão por N).
    inner = inner.replace(/(^|\s)tu\s+(\d+)/g, (_m, pre, n) => {
      const N = Number(n);
      if (N > 0) factor *= (TUPLET_DEN[N] ?? 2) / N;
      return pre;
    });
    for (const w of bareWords(inner)) {
      const lw = w.toLowerCase();
      if (lw === "d") factor *= 1.5;
      else if (lw === "dd") factor *= 1.75;
      else if (lw === "gr") return 0; // grace: beat não ocupa tempo
    }
  }
  return factor;
}

/** Soma das durações dos beats do compasso, em 64avos (pode ser fracionário). */
export function measureUsed64(measure: EditorMeasure): number {
  return measure.beats.reduce(
    (sum, b) => sum + (64 / b.duration) * beatDurationFactor(b.suffix),
    0,
  );
}

/** Capacidade da fórmula de compasso (ex.: 4/4 → 64), em 64avos. */
export function capacity64(tsNum: number, tsDen: number): number {
  return (tsNum * 64) / tsDen;
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

  // Pausa virando nota: anotações de pausa (ex.: dinâmica) não se aplicam.
  if (beat.isRest) beat.suffix = undefined;
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
  if (beat.notes.length === 0) {
    beat.isRest = true;
    beat.suffix = undefined;
  }
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
  beat.suffix = undefined;
  return next;
}

/** Altera a duração de um beat (preserva notas e anotações). */
export function setBeatDuration(
  model: EditorModel,
  measureIndex: number,
  beatIndex: number,
  duration: BeatDuration,
): EditorModel {
  const next = cloneModel(model);
  const beat = next.measures[measureIndex]?.beats[beatIndex];
  if (!beat) return model;

  beat.duration = duration;
  return next;
}

/**
 * Insere um novo beat (rest) após `afterBeatIndex` no compasso.
 * Sem `duration` explícita, herda a do beat de referência.
 */
export function insertBeat(
  model: EditorModel,
  measureIndex: number,
  afterBeatIndex: number,
  duration?: BeatDuration,
): EditorModel {
  const next = cloneModel(model);
  const measure = next.measures[measureIndex];
  if (!measure) return model;

  const d = duration ?? measure.beats[afterBeatIndex]?.duration ?? 4;
  const newBeat: EditorBeat = { duration: d, notes: [], isRest: true };
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

// ── Pontuado (dots) ────────────────────────────────────────────────────────────
// No alphaTex o ponto de aumento é uma propriedade de BEAT: `d` (pontuado, ×1.5)
// ou `dd` (duplo, ×1.75), dentro do grupo `{…}` após a duração. O parser do
// alphaTab lê UM único grupo de propriedades por beat — por isso setBeatDots
// mescla tudo num grupo só (mesma regra do serializeNote para notas).

/**
 * Tokens de nível superior do conteúdo de um grupo `{…}`: separa por espaço
 * fora de aspas/parênteses, preservando cada token verbatim. Diferente de
 * `bareWords`, NÃO descarta os parâmetros — serve para reescrever o grupo.
 */
function splitTopLevelTokens(inner: string): string[] {
  const tokens: string[] = [];
  let cur = "";
  let depth = 0;
  let inStr = false;
  for (const ch of inner) {
    if (inStr) {
      cur += ch;
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; cur += ch; continue; }
    if (ch === "(") { depth++; cur += ch; continue; }
    if (ch === ")") { depth = Math.max(0, depth - 1); cur += ch; continue; }
    if (depth === 0 && /\s/.test(ch)) {
      if (cur) { tokens.push(cur); cur = ""; }
      continue;
    }
    cur += ch;
  }
  if (cur) tokens.push(cur);
  return tokens;
}

/** Nº de pontos de aumento do beat (0, 1 ou 2), lido das anotações `{d}`/`{dd}`. */
export function beatDots(beat: EditorBeat): 0 | 1 | 2 {
  if (!beat.suffix) return 0;
  for (const g of splitBraceGroups(beat.suffix)) {
    for (const t of splitTopLevelTokens(g.slice(1, -1))) {
      const lt = t.toLowerCase();
      if (lt === "dd") return 2;
      if (lt === "d") return 1;
    }
  }
  return 0;
}

/**
 * Define o nº de pontos do beat, preservando as demais anotações (letra,
 * dinâmica, quiáltera…). Reescreve o sufixo como UM único grupo `{…}` — o
 * parser do alphaTab só aceita um grupo de propriedades por beat.
 */
export function setBeatDots(
  model: EditorModel,
  measureIndex: number,
  beatIndex: number,
  dots: 0 | 1 | 2,
): EditorModel {
  const next = cloneModel(model);
  const beat = next.measures[measureIndex]?.beats[beatIndex];
  if (!beat) return model;

  const tokens: string[] = [];
  for (const g of splitBraceGroups(beat.suffix ?? "")) {
    for (const t of splitTopLevelTokens(g.slice(1, -1))) {
      const lt = t.toLowerCase();
      if (lt !== "d" && lt !== "dd") tokens.push(t);
    }
  }
  if (dots === 1) tokens.push("d");
  else if (dots === 2) tokens.push("dd");
  beat.suffix = tokens.length ? `{${tokens.join(" ")}}` : undefined;
  return next;
}

// ── Trecho: substituir/mover beats (clipboard e ajuste de tempo) ───────────────

const EMPTY_PLACEHOLDER: EditorBeat = { duration: 1, notes: [], isRest: true };

/**
 * Substitui `deleteCount` beats a partir de `startBeat` pelos `newBeats`
 * (clonados). Garante ≥1 beat no compasso (pausa inteira se esvaziar) e limpa
 * `wasEmpty` quando entra conteúdo real.
 */
export function replaceBeatsInMeasure(
  model: EditorModel,
  measureIndex: number,
  startBeat: number,
  deleteCount: number,
  newBeats: EditorBeat[],
): EditorModel {
  const next = cloneModel(model);
  const measure = next.measures[measureIndex];
  if (!measure || startBeat < 0 || startBeat > measure.beats.length) return model;

  measure.beats.splice(startBeat, deleteCount, ...cloneBeats(newBeats));
  if (measure.beats.length === 0) measure.beats.push({ ...EMPTY_PLACEHOLDER, notes: [] });
  if (newBeats.length > 0) measure.wasEmpty = undefined;
  return next;
}

/** Compasso "convencionalmente vazio": uma única pausa inteira sem anotações. */
function isEmptyPlaceholder(measure: EditorMeasure): boolean {
  return (
    measure.beats.length === 1 &&
    measure.beats[0].isRest &&
    measure.beats[0].notes.length === 0 &&
    measure.beats[0].duration === 1 &&
    !measure.beats[0].suffix
  );
}

/**
 * Move um beat um passo no tempo (dir −1 = antes, +1 = depois). Dentro do
 * compasso é troca com o vizinho (capacidade inalterada); na borda, o beat
 * atravessa para o compasso vizinho (o chamador valida a capacidade do
 * destino). Compasso de destino vazio (pausa inteira única) é SUBSTITUÍDO pelo
 * beat, não somado — senão a pausa inteira estouraria a fórmula de compasso.
 * Retorna null quando não há para onde mover (borda da música).
 */
export function moveBeat(
  model: EditorModel,
  measureIndex: number,
  beatIndex: number,
  dir: -1 | 1,
): { model: EditorModel; measureIndex: number; beatIndex: number } | null {
  const next = cloneModel(model);
  const measure = next.measures[measureIndex];
  const beat = measure?.beats[beatIndex];
  if (!measure || !beat) return null;

  const ni = beatIndex + dir;
  if (ni >= 0 && ni < measure.beats.length) {
    measure.beats[beatIndex] = measure.beats[ni];
    measure.beats[ni] = beat;
    return { model: next, measureIndex, beatIndex: ni };
  }

  const targetIndex = measureIndex + dir;
  const target = next.measures[targetIndex];
  if (!target) return null;

  measure.beats.splice(beatIndex, 1);
  if (measure.beats.length === 0) measure.beats.push({ ...EMPTY_PLACEHOLDER, notes: [] });

  let targetBeatIndex: number;
  if (isEmptyPlaceholder(target)) {
    target.beats = [beat];
    targetBeatIndex = 0;
  } else if (dir === 1) {
    target.beats.unshift(beat);
    targetBeatIndex = 0;
  } else {
    target.beats.push(beat);
    targetBeatIndex = target.beats.length - 1;
  }
  target.wasEmpty = undefined;
  return { model: next, measureIndex: targetIndex, beatIndex: targetBeatIndex };
}

/**
 * Move a nota de uma corda para outra no mesmo beat (mesma casa). Retorna o
 * modelo original quando não há nota na corda de origem ou a de destino já
 * está ocupada — o chamador distingue por identidade (`next === model`).
 */
export function moveNoteToString(
  model: EditorModel,
  measureIndex: number,
  beatIndex: number,
  fromString: number,
  toString: number,
): EditorModel {
  const next = cloneModel(model);
  const beat = next.measures[measureIndex]?.beats[beatIndex];
  if (!beat) return model;
  const note = beat.notes.find((n) => n.string === fromString);
  if (!note) return model;
  if (beat.notes.some((n) => n.string === toString)) return model;
  note.string = toString;
  beat.notes.sort((a, b) => a.string - b.string);
  return next;
}

// ── Bend com distância ─────────────────────────────────────────────────────────
// O valor do bend no alphaTab é em QUARTOS DE TOM: 2 = ½ tom, 4 = 1 tom ("full"),
// 6 = 1½ tom. O nosso editor escreve o bend simples de 2 pontos `{b (0 N)}`;
// bends importados vêm como `be (tipo estilo pontos…)` ou com curva multi-ponto —
// esses são "custom": preservados opacos, substituíveis mas não decompostos.

/** Distância do bend: quartos de tom (2/4/6…), "custom" (curva importada) ou null. */
export type BendAmount = number | "custom" | null;

/** Lê o bend da nota da corda: N quartos de tom, "custom" ou null (sem bend). */
export function noteBendQuarters(
  model: EditorModel,
  measureIndex: number,
  beatIndex: number,
  string: number,
): BendAmount {
  const note = model.measures[measureIndex]?.beats[beatIndex]?.notes.find(
    (n) => n.string === string,
  );
  if (!note?.suffix) return null;
  for (const g of splitBraceGroups(note.suffix)) {
    const tokens = splitTopLevelTokens(g.slice(1, -1));
    for (let i = 0; i < tokens.length; i++) {
      const lt = tokens[i].toLowerCase();
      if (lt !== "b" && lt !== "be") continue;
      const args = tokens[i + 1];
      if (args?.startsWith("(")) {
        const parts = args.slice(1, -1).trim().split(/\s+/);
        const idents = parts.filter((p) => !/^-?\d/.test(p)).map((p) => p.toLowerCase());
        const nums = parts.filter((p) => /^-?\d/.test(p)).map(Number);
        // Nosso formato simples: b (0 N).
        if (lt === "b" && idents.length === 0 && nums.length === 2 && nums[0] === 0) {
          return nums[1];
        }
        // O exporter re-escreve b (0 N) como be (bend 0 0 60 N) — pares
        // offset/valor (0,0)→(60,N), tipo "bend", estilo default. Mesmo bend.
        if (
          lt === "be" &&
          (idents.length === 0 || (idents.length === 1 && idents[0] === "bend")) &&
          nums.length === 4 && nums[0] === 0 && nums[1] === 0 && nums[2] === 60
        ) {
          return nums[3];
        }
      }
      return "custom";
    }
  }
  return null;
}

/** Remove os tokens de bend (`b`/`be` + seus pontos) do sufixo da nota. */
function stripBendTokens(suffix: string | undefined): string[] {
  const kept: string[] = [];
  for (const g of splitBraceGroups(suffix ?? "")) {
    const tokens = splitTopLevelTokens(g.slice(1, -1));
    for (let i = 0; i < tokens.length; i++) {
      const lt = tokens[i].toLowerCase();
      if (lt === "b" || lt === "be") {
        if (tokens[i + 1]?.startsWith("(")) i++; // pula os pontos do bend
        continue;
      }
      kept.push(tokens[i]);
    }
  }
  return kept;
}

/**
 * Define o bend da nota: `quarters` em quartos de tom (2 = ½, 4 = full, 6 = 1½)
 * ou null para remover. Substitui qualquer bend existente (inclusive um
 * importado "custom" — a curva antiga é descartada só aqui, a pedido).
 */
export function setBend(
  model: EditorModel,
  measureIndex: number,
  beatIndex: number,
  string: number,
  quarters: number | null,
): EditorModel {
  const next = cloneModel(model);
  const beat = next.measures[measureIndex]?.beats[beatIndex];
  if (!beat) return model;
  const note = beat.notes.find((n) => n.string === string);
  if (!note) return model;

  const tokens = stripBendTokens(note.suffix);
  if (quarters !== null) tokens.push(`b (0 ${quarters})`);
  note.suffix = tokens.length ? `{${tokens.join(" ")}}` : undefined;
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
