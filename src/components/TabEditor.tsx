"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  type BeatDuration,
  type EditorCursor,
  type EditorModel,
  type NoteEffect,
  capacity64,
  deleteBeat,
  deleteNote,
  insertBeat,
  measureUsed64,
  noteHasBend,
  parseTrackTex,
  serializeForRender,
  serializeModel,
  setBeatDuration,
  setNote,
  setRest,
  toggleBend,
  toggleEffect,
} from "@/lib/alphatex-editor";

// ── Tipos alphaTab (importados dinamicamente) ──────────────────────────────────
type AlphaTabModule = typeof import("@coderline/alphatab");
type AlphaTabApi = InstanceType<AlphaTabModule["AlphaTabApi"]>;

// ── Constantes da UI ────────────────────────────────────────────────────────────

const DURATIONS: Array<{ value: BeatDuration; label: string; title: string }> = [
  { value: 1,  label: "1",  title: "Semibreve"    },
  { value: 2,  label: "2",  title: "Mínima"       },
  { value: 4,  label: "4",  title: "Semínima"     },
  { value: 8,  label: "8",  title: "Colcheia"     },
  { value: 16, label: "16", title: "Semicolcheia" },
  { value: 32, label: "32", title: "Fusa"         },
];

const EFFECTS: Array<{ value: NoteEffect; label: string; title: string }> = [
  { value: "h",  label: "H",  title: "Hammer-on (liga à próxima nota da mesma corda)" },
  { value: "p",  label: "P",  title: "Pull-off (liga à próxima nota da mesma corda)"  },
  { value: "sl", label: "/",  title: "Slide (desliza até a próxima nota)"             },
  { value: "v",  label: "~",  title: "Vibrato"                                        },
  { value: "lr", label: "LR", title: "Let ring (deixa soar)"                          },
];

// Nomes de cordas (string 1 = mais aguda, convenção alphaTex)
const STRING_NAMES_6 = ["e", "B", "G", "D", "A", "E"];
const STRING_NAMES_4 = ["G", "D", "A", "E"];
function stringName(s: number, count: number): string {
  const names = count === 4 ? STRING_NAMES_4 : STRING_NAMES_6;
  return names[s - 1] ?? String(s);
}

// Janela (ms) para acumular dígitos numa casa de dois dígitos (ex.: 1 depois 2 = 12).
const MULTI_DIGIT_WINDOW_MS = 900;
const MAX_FRET = 24;

// ── Geometria das linhas do tab (compartilhada: overlay + clique por corda) ────
// Bounds vindos do alphaTab (tipagem estrutural mínima do que usamos).
type BoundsLike = { x: number; y: number; w: number; h: number };
type NoteBoundsLike = { note: { string: number }; noteHeadBounds: BoundsLike };
type BeatBoundsLike = {
  visualBounds: BoundsLike;
  barBounds: { visualBounds: BoundsLike; beats?: { notes?: NoteBoundsLike[] | null }[] };
  notes?: NoteBoundsLike[] | null;
};

/**
 * Y da 1ª linha (corda 1, aguda, topo) + espaçamento entre linhas do compasso.
 * Calibra pelas notas presentes no compasso quando existem (exato); senão
 * interpola pelos limites visuais do compasso.
 */
function stringGeometry(bb: BeatBoundsLike, staffStrings: number): { topY: number; spacing: number } {
  const barVB = bb.barBounds.visualBounds;
  const refs = new Map<number, number>(); // linha (0-based) → centro Y
  for (const beatB of bb.barBounds.beats ?? []) {
    for (const n of beatB.notes ?? []) {
      const texS = staffStrings + 1 - n.note.string; // modelo alphaTab → alphaTex
      refs.set(texS - 1, n.noteHeadBounds.y + n.noteHeadBounds.h / 2);
    }
  }
  let spacing = barVB.h / Math.max(1, staffStrings - 1);
  let topY = barVB.y;
  const entries = [...refs.entries()].sort((a, b) => a[0] - b[0]);
  if (entries.length >= 2) {
    const [l1, y1] = entries[0];
    const [l2, y2] = entries[entries.length - 1];
    if (l2 !== l1) spacing = (y2 - y1) / (l2 - l1);
    topY = y1 - l1 * spacing;
  } else if (entries.length === 1) {
    const [l1, y1] = entries[0];
    topY = y1 - l1 * spacing;
  }
  return { topY, spacing };
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

// Tolerância nas comparações de capacidade (quiálteras geram frações de 64avo).
const CAP_EPS = 0.01;

// ── Props ───────────────────────────────────────────────────────────────────────

export type MeasureMeta = {
  tsNum: number;
  tsDen: number;
  structPrefix: string | null;
};

type Props = {
  alphaTex: string;
  onChange: (tex: string) => void;
  disabled?: boolean;
  /** 6 para guitarra, 4 para baixo. Default 6. */
  trackStringCount?: number;
  /** Header real da trilha (Track.headerFragment) — afinação/instrumento no render. */
  trackHeader?: string | null;
  /** Estrutura por compasso (fórmula de compasso, \ts/\tempo…) — render + capacidade. */
  measureMeta?: MeasureMeta[];
  /** Clique num beat → pede seek da música completa para este tick. */
  onSeek?: (tick: number) => void;
  /** Percussão usa notação própria — força edição em texto (sem modo visual). */
  percussion?: boolean;
  /** Dono da música pode alterar a estrutura (adicionar/remover compassos). */
  canEditStructure?: boolean;
  /** Inserir um compasso vazio DEPOIS de measureIndex (todas as trilhas). */
  onAddMeasure?: (afterMeasureIndex: number) => void;
  /** Remover o compasso measureIndex (todas as trilhas). */
  onDeleteMeasure?: (measureIndex: number) => void;
  /** Mensagem de erro vinda do TrackEditor. */
  error?: string | null;
  /** Mensagem de sucesso/info vinda do TrackEditor. */
  info?: string | null;
};

/** Controle imperativo exposto ao pai (TrackEditor). */
export type TabEditorHandle = {
  /** Move o cursor de playback do editor para um tick musical (vindo do player). */
  seekTick: (tick: number) => void;
};

type Rect = { x: number; y: number; w: number; h: number };

// ── Componente ──────────────────────────────────────────────────────────────────

const TabEditor = forwardRef<TabEditorHandle, Props>(function TabEditor(
  {
    alphaTex,
    onChange,
    disabled = false,
    trackStringCount = 6,
    trackHeader,
    measureMeta,
    onSeek,
    percussion = false,
    canEditStructure = false,
    onAddMeasure,
    onDeleteMeasure,
    error,
    info,
  },
  ref,
) {
  // ── Estado interno ─────────────────────────────────────────────────────────
  const [model, setModel] = useState<EditorModel>(() => parseTrackTex(alphaTex));
  const [cursor, setCursor] = useState<EditorCursor>(null);
  const [duration, setDuration] = useState<BeatDuration>(4);
  const [rawMode, setRawMode] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  // Percussão: sempre texto (a notação "Kick (hit)".8 não cabe no modelo visual).
  const raw = rawMode || percussion;
  // Bumped a cada render do alphaTab — dispara o recálculo do overlay de seleção.
  const [renderEpoch, setRenderEpoch] = useState(0);
  // Aviso transitório (ação bloqueada: compasso cheio etc.)
  const [warn, setWarn] = useState<string | null>(null);
  // Overlay de seleção: coluna do beat + caixa da corda selecionada.
  const [beatRect, setBeatRect] = useState<Rect | null>(null);
  const [noteRect, setNoteRect] = useState<Rect | null>(null);
  // Badges de compasso incompleto/estourado (posicionados sobre a tablatura).
  const [measureFlags, setMeasureFlags] = useState<
    { x: number; y: number; label: string; kind: "under" | "over" }[]
  >([]);

  // Refs para evitar closures obsoletas nos event handlers do alphaTab
  const modelRef  = useRef<EditorModel>(model);
  const cursorRef = useRef<EditorCursor>(cursor);
  const surfaceRef  = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<AlphaTabApi | null>(null);
  const prevRawModeRef = useRef(false);
  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Último dígito digitado (para casas de dois dígitos).
  const lastDigitRef = useRef<
    { time: number; measureIndex: number; beatIndex: number; string: number; value: number } | null
  >(null);
  // Posição do último mousedown, relativa ao surface (mesmo espaço dos bounds).
  // Permite clicar em QUALQUER corda do beat, não só onde há nota.
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  // Contexto de render + callbacks sempre atuais (handlers registrados uma vez).
  const trackHeaderRef = useRef(trackHeader);
  const measureMetaRef = useRef(measureMeta);
  const onSeekRef = useRef(onSeek);
  const stringCountRef = useRef(trackStringCount);
  trackHeaderRef.current = trackHeader;
  measureMetaRef.current = measureMeta;
  onSeekRef.current = onSeek;
  stringCountRef.current = trackStringCount;
  // Último alphaTex EMITIDO por nós — distingue mudança externa (refetch/aceite)
  // de eco da nossa própria edição.
  const lastEmittedRef = useRef(alphaTex);

  useEffect(() => { modelRef.current = model; }, [model]);
  useEffect(() => { cursorRef.current = cursor; }, [cursor]);

  // Texto alphaTex renderizável (documento real de 1 trilha — ver serializeForRender).
  const renderTex = useCallback((m: EditorModel) => {
    return serializeForRender(m, {
      trackHeader: trackHeaderRef.current,
      structPrefixes: measureMetaRef.current?.map((mm) => mm.structPrefix),
    });
  }, []);

  // Cursor de playback: o pai encaminha o tick do player headless (a música
  // completa) para cá; setar tickPosition move o cursor do editor sem tocar áudio.
  useImperativeHandle(ref, () => ({
    seekTick: (tick: number) => {
      const api = apiRef.current;
      if (api) api.tickPosition = tick;
    },
  }), []);

  // ── Mudança EXTERNA do alphaTex (refetch pós-save, aceite de proposta) ──────
  // Se o prop mudou e não foi eco de onChange nosso, re-sincroniza modelo+render.
  useEffect(() => {
    if (alphaTex !== lastEmittedRef.current) {
      lastEmittedRef.current = alphaTex;
      const m = parseTrackTex(alphaTex);
      setModel(m);
      setCursor(null);
      apiRef.current?.tex(renderTex(m));
    }
  }, [alphaTex, renderTex]);

  // ── Retorno do modo texto → re-render do alphaTab com o modelo atual ────────
  useEffect(() => {
    if (!rawMode && prevRawModeRef.current && apiRef.current) {
      apiRef.current.tex(renderTex(modelRef.current));
    }
    prevRawModeRef.current = rawMode;
  }, [rawMode, renderTex]);

  // ── Inicialização do alphaTab (uma vez na montagem) ────────────────────────
  useEffect(() => {
    // Percussão: modo texto permanente — não inicializa o alphaTab do editor
    // (a notação de percussão não passa pelo nosso modelo e quebraria o render).
    if (percussion) return;

    let api: AlphaTabApi | null = null;
    let disposed = false;

    (async () => {
      const at = await import("@coderline/alphatab");
      if (disposed || !surfaceRef.current) return;

      api = new at.AlphaTabApi(surfaceRef.current, {
        core: {
          fontDirectory: "/font/",
          // Necessário para noteMouseDown e para os NoteBounds do overlay.
          includeNoteBounds: true,
        },
        display: {
          staveProfile: "Tab",
          scale: 1.0,
          resources: {
            mainGlyphColor:      "#e8eaed",
            secondaryGlyphColor: "#aab2c0",
            scoreInfoColor:      "#ffffff",
            staffLineColor:      "#39414f",
            barSeparatorColor:   "#39414f",
            barNumberColor:      "#8c93a3",
          },
        },
        player: {
          enablePlayer:          true,
          enableCursor:          true,   // mostra onde a música está tocando
          enableUserInteraction: true,   // habilita beat/noteMouseDown
          soundFont:             "/soundfont/sonivox.sf2",
          scrollElement:         viewportRef.current ?? undefined,
          scrollMode:            at.ScrollMode.Continuous,
        },
      });

      api.scoreLoaded.on(() => {
        setApiReady(true);
        requestAnimationFrame(() => viewportRef.current?.focus());
      });

      // Recalcula o overlay de seleção a cada re-render (bounds mudam).
      api.postRenderFinished.on(() => setRenderEpoch((e) => e + 1));

      // beatMouseDown dispara em QUALQUER beat (notas E rests): seleciona o
      // cursor e pede seek da música completa para o tick clicado.
      api.beatMouseDown.on((beat) => {
        const measureIndex = beat.voice.bar.index;
        const mod = modelRef.current;
        const measure = mod.measures[measureIndex];
        if (!measure) return;
        // Vozes 1+ são opacas no editor (MVP): mapeia para o beat mais próximo
        // da voz 0 em vez de usar um índice de outra voz.
        const beatIndex = Math.max(
          0,
          Math.min(beat.index, measure.beats.length - 1),
        );
        // Corda pelo Y do clique: dá para selecionar qualquer linha do tab,
        // inclusive posições vazias (sem nota). noteMouseDown refina depois.
        let string = cursorRef.current?.string ?? 1;
        const staffStrings =
          beat.voice.bar.staff.tuning?.length || stringCountRef.current;
        const ptr = lastPointerRef.current;
        const bb = apiRef.current?.boundsLookup?.findBeat(beat);
        if (bb && ptr) {
          const { topY, spacing } = stringGeometry(
            bb as unknown as BeatBoundsLike,
            staffStrings,
          );
          if (spacing > 0) {
            const s = Math.round((ptr.y - topY) / spacing) + 1;
            string = Math.max(1, Math.min(staffStrings, s));
          }
        }
        setCursor({ measureIndex, beatIndex, string });
        // Seek: reposiciona a música completa neste ponto (tocando ou pausado).
        const tick =
          (beat as unknown as { absolutePlaybackStart?: number }).absolutePlaybackStart ??
          beat.voice.bar.masterBar.start + beat.playbackStart;
        onSeekRef.current?.(tick);
        viewportRef.current?.focus();
      });

      // noteMouseDown refina a CORDA quando o clique foi num número de casa.
      // CONVERSÃO CRÍTICA: o modelo do alphaTab numera corda 1 = mais GRAVE;
      // o alphaTex (nosso modelo) numera 1 = mais AGUDA. Sem converter, clicar
      // numa nota selecionava a corda espelhada — o bug do "adicionei na corda
      // errada".
      api.noteMouseDown.on((note) => {
        const measureIndex = note.beat.voice.bar.index;
        const mod = modelRef.current;
        const measure = mod.measures[measureIndex];
        if (!measure) return;
        const beatIndex = Math.max(
          0,
          Math.min(note.beat.index, measure.beats.length - 1),
        );
        const staffStrings =
          note.beat.voice.bar.staff.tuning?.length || stringCountRef.current;
        const texString = staffStrings + 1 - note.string;
        setCursor({ measureIndex, beatIndex, string: texString });
      });

      api.error.on((err) => {
        console.error("[TabEditor] alphaTab error:", err);
      });

      apiRef.current = api;
      api.tex(renderTex(modelRef.current));
    })();

    return () => {
      disposed = true;
      apiRef.current = null;
      api?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Apenas na montagem — pai usa key={trackOrder} para remontar ao trocar trilha

  // ── Aplicar edição ao alphaTab e notificar o pai ───────────────────────────
  const applyModel = useCallback(
    (newModel: EditorModel) => {
      const tex = serializeModel(newModel);
      lastEmittedRef.current = tex;
      setModel(newModel);
      onChange(tex);
      apiRef.current?.tex(renderTex(newModel));
    },
    [onChange, renderTex],
  );

  // ── Aviso transitório ────────────────────────────────────────────────────────
  const showWarn = useCallback((message: string) => {
    setWarn(message);
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
    warnTimerRef.current = setTimeout(() => setWarn(null), 2200);
  }, []);
  useEffect(() => () => {
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
  }, []);

  // ── Capacidade do compasso (fórmula de compasso) ────────────────────────────
  const measureTs = useCallback((measureIndex: number): { num: number; den: number } => {
    const meta = measureMetaRef.current?.[measureIndex];
    return { num: meta?.tsNum ?? 4, den: meta?.tsDen ?? 4 };
  }, []);

  // ── Handler de teclado ─────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      const cur = cursorRef.current;
      const mod = modelRef.current;

      // Dígito 0–9 → define a casa da nota selecionada.
      // Dois dígitos seguidos (ex.: 1 depois 2 → 12) se digitados rápido na mesma
      // posição, respeitando o limite de casa (≤ 24); senão recomeça no dígito.
      if (/^[0-9]$/.test(e.key)) {
        if (!cur) return;
        e.preventDefault();
        const digit = parseInt(e.key, 10);
        const now = Date.now();
        const last = lastDigitRef.current;
        let fret = digit;
        if (
          last &&
          last.measureIndex === cur.measureIndex &&
          last.beatIndex === cur.beatIndex &&
          last.string === cur.string &&
          now - last.time < MULTI_DIGIT_WINDOW_MS
        ) {
          const combined = last.value * 10 + digit;
          if (combined <= MAX_FRET) fret = combined;
        }
        applyModel(setNote(mod, cur.measureIndex, cur.beatIndex, cur.string, fret));
        lastDigitRef.current = {
          time: now,
          measureIndex: cur.measureIndex,
          beatIndex: cur.beatIndex,
          string: cur.string,
          value: fret,
        };
        return;
      }

      switch (e.key) {
        case "ArrowRight": {
          e.preventDefault();
          if (!cur) return;
          const measure = mod.measures[cur.measureIndex];
          if (!measure) return;
          if (cur.beatIndex < measure.beats.length - 1) {
            setCursor({ ...cur, beatIndex: cur.beatIndex + 1 });
          } else if (cur.measureIndex < mod.measures.length - 1) {
            setCursor({ measureIndex: cur.measureIndex + 1, beatIndex: 0, string: cur.string });
          }
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          if (!cur) return;
          if (cur.beatIndex > 0) {
            setCursor({ ...cur, beatIndex: cur.beatIndex - 1 });
          } else if (cur.measureIndex > 0) {
            const prev = mod.measures[cur.measureIndex - 1];
            setCursor({
              measureIndex: cur.measureIndex - 1,
              beatIndex:    prev ? Math.max(0, prev.beats.length - 1) : 0,
              string:       cur.string,
            });
          }
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          if (!cur || cur.string <= 1) return;
          setCursor({ ...cur, string: cur.string - 1 });
          break;
        }
        case "ArrowDown": {
          e.preventDefault();
          if (!cur || cur.string >= trackStringCount) return;
          setCursor({ ...cur, string: cur.string + 1 });
          break;
        }
        case "r": {
          e.preventDefault();
          if (!cur) return;
          applyModel(setRest(mod, cur.measureIndex, cur.beatIndex));
          break;
        }
        case "i": {
          e.preventDefault();
          if (!cur) return;
          const measure = mod.measures[cur.measureIndex];
          if (!measure) return;
          // Noção de compasso: só insere se couber na fórmula de compasso.
          const { num, den } = measureTs(cur.measureIndex);
          const cap = capacity64(num, den);
          const used = measureUsed64(measure);
          const remaining = cap - used;
          if (remaining <= CAP_EPS) {
            showWarn(`Compasso cheio (${num}/${den}) — apague ou encurte um beat antes de inserir.`);
            return;
          }
          // Duração do novo beat: a do beat de referência se couber; senão a
          // maior figura que ainda cabe no compasso.
          const refDur = measure.beats[cur.beatIndex]?.duration ?? 4;
          let newDur: BeatDuration | null =
            64 / refDur <= remaining + CAP_EPS ? refDur : null;
          if (newDur === null) {
            for (const d of [1, 2, 4, 8, 16, 32] as const) {
              if (64 / d <= remaining + CAP_EPS) { newDur = d; break; }
            }
          }
          if (newDur === null) {
            showWarn(`Não cabe nem uma semicolcheia no compasso (${num}/${den}).`);
            return;
          }
          applyModel(insertBeat(mod, cur.measureIndex, cur.beatIndex, newDur));
          setCursor({ ...cur, beatIndex: cur.beatIndex + 1 });
          break;
        }
        case "Backspace":
        case "Delete": {
          e.preventDefault();
          if (!cur) return;
          const beat = mod.measures[cur.measureIndex]?.beats[cur.beatIndex];
          if (!beat) return;
          if (beat.notes.some((n) => n.string === cur.string)) {
            applyModel(deleteNote(mod, cur.measureIndex, cur.beatIndex, cur.string));
          } else if (beat.notes.length === 0) {
            // Só apaga o BEAT quando ele já é pausa — evita apagar um beat com
            // notas noutras cordas sem querer.
            const next = deleteBeat(mod, cur.measureIndex, cur.beatIndex);
            applyModel(next);
            const newBeatIdx = Math.min(
              cur.beatIndex,
              Math.max(0, (next.measures[cur.measureIndex]?.beats.length ?? 1) - 1),
            );
            setCursor({ ...cur, beatIndex: newBeatIdx });
          } else {
            showWarn(
              `Sem nota na corda ${cur.string} (${stringName(cur.string, trackStringCount)}) — selecione a corda da nota para apagar.`,
            );
          }
          break;
        }
      }
    },
    [applyModel, disabled, trackStringCount, measureTs, showWarn],
  );

  // ── Duração ────────────────────────────────────────────────────────────────
  function handleDurationChange(d: BeatDuration) {
    setDuration(d);
    if (disabled) return;
    const cur = cursorRef.current;
    const mod = modelRef.current;
    if (!cur) return;
    const measure = mod.measures[cur.measureIndex];
    const beat = measure?.beats[cur.beatIndex];
    if (!measure || !beat || beat.duration === d) return;
    // Noção de compasso: bloqueia se a mudança estourar a fórmula de compasso
    // (permite sempre REDUZIR o total, mesmo num compasso já estourado).
    const { num, den } = measureTs(cur.measureIndex);
    const cap = capacity64(num, den);
    const used = measureUsed64(measure);
    const newUsed = used - 64 / beat.duration + 64 / d;
    if (newUsed > cap + CAP_EPS && newUsed >= used - CAP_EPS) {
      showWarn(`Não cabe no compasso (${num}/${den}) — encurte outro beat primeiro.`);
      return;
    }
    applyModel(setBeatDuration(mod, cur.measureIndex, cur.beatIndex, d));
  }

  // ── Seleção de corda ───────────────────────────────────────────────────────
  function handleStringSelect(string: number) {
    const cur = cursorRef.current;
    if (!cur) return;
    setCursor({ ...cur, string });
    viewportRef.current?.focus();
  }

  // ── Efeito ─────────────────────────────────────────────────────────────────
  // Resolve em qual corda aplicar o efeito: a do cursor se houver nota nela;
  // senão, a (única/primeira) nota do beat.
  function targetString(beat: EditorModel["measures"][number]["beats"][number], cursorString: number): number {
    if (beat.notes.some((n) => n.string === cursorString)) return cursorString;
    return beat.notes[0]?.string ?? cursorString;
  }

  function handleEffectToggle(effect: NoteEffect) {
    if (disabled) return;
    const cur = cursorRef.current;
    const mod = modelRef.current;
    if (!cur) return;
    const beat = mod.measures[cur.measureIndex]?.beats[cur.beatIndex];
    if (!beat || beat.notes.length === 0) return;
    const string = targetString(beat, cur.string);
    if (string !== cur.string) setCursor({ ...cur, string });
    applyModel(toggleEffect(mod, cur.measureIndex, cur.beatIndex, string, effect));
  }

  // Bend é separado (mora no suffix opaco, com pontos), não é um NoteEffect simples.
  function handleBendToggle() {
    if (disabled) return;
    const cur = cursorRef.current;
    const mod = modelRef.current;
    if (!cur) return;
    const beat = mod.measures[cur.measureIndex]?.beats[cur.beatIndex];
    if (!beat || beat.notes.length === 0) return;
    const string = targetString(beat, cur.string);
    if (string !== cur.string) setCursor({ ...cur, string });
    applyModel(toggleBend(mod, cur.measureIndex, cur.beatIndex, string));
  }

  // Beat selecionado e se ele tem nota (efeitos só fazem sentido sobre notas).
  const selectedBeat = cursor
    ? model.measures[cursor.measureIndex]?.beats[cursor.beatIndex] ?? null
    : null;
  const selectedHasNotes = !!selectedBeat && selectedBeat.notes.length > 0;

  function activeEffects(): NoteEffect[] {
    if (!cursor || !selectedBeat) return [];
    const string = targetString(selectedBeat, cursor.string);
    return selectedBeat.notes.find((n) => n.string === string)?.effects ?? [];
  }
  const effects = activeEffects();
  const bendActive =
    !!cursor && !!selectedBeat && selectedHasNotes
      ? noteHasBend(
          model,
          cursor.measureIndex,
          cursor.beatIndex,
          targetString(selectedBeat, cursor.string),
        )
      : false;

  // ── Duração "exibida" na toolbar ───────────────────────────────────────────
  const displayDuration: BeatDuration = cursor
    ? (model.measures[cursor.measureIndex]?.beats[cursor.beatIndex]?.duration ?? duration)
    : duration;

  // ── Estado de preenchimento do compasso selecionado ────────────────────────
  const fill = (() => {
    if (!cursor) return null;
    const measure = model.measures[cursor.measureIndex];
    if (!measure) return null;
    const { num, den } = measureTs(cursor.measureIndex);
    const cap = capacity64(num, den);
    const used = measureUsed64(measure);
    const state =
      used > cap + CAP_EPS ? "over" : Math.abs(used - cap) <= CAP_EPS ? "full" : "open";
    return { num, den, state };
  })();

  // ── Overlay de seleção (indicação visual de beat + corda) ──────────────────
  useEffect(() => {
    if (!apiReady || raw || !cursor) {
      setBeatRect(null);
      setNoteRect(null);
      return;
    }
    const api = apiRef.current;
    const score = api?.score;
    const bar = score?.tracks?.[0]?.staves?.[0]?.bars?.[cursor.measureIndex];
    const beat = bar?.voices?.[0]?.beats?.[cursor.beatIndex];
    const lookup = api?.boundsLookup;
    const bb = beat && lookup ? lookup.findBeat(beat) : null;
    if (!bb || !bar) {
      setBeatRect(null);
      setNoteRect(null);
      return;
    }
    // Offset do surface dentro do viewport (bounds são relativos ao surface).
    const offX = surfaceRef.current?.offsetLeft ?? 0;
    const offY = surfaceRef.current?.offsetTop ?? 0;

    const barVB = bb.barBounds.visualBounds;
    setBeatRect({
      x: offX + bb.visualBounds.x - 3,
      y: offY + barVB.y,
      w: bb.visualBounds.w + 6,
      h: barVB.h,
    });

    // Corda selecionada → caixa na linha correspondente.
    const staffStrings = bar.staff.tuning?.length || trackStringCount;
    const targetModelString = staffStrings + 1 - cursor.string; // tex → modelo alphaTab
    const exact = bb.notes?.find((n) => n.note.string === targetModelString);
    if (exact) {
      const nb = exact.noteHeadBounds;
      setNoteRect({ x: offX + nb.x - 3, y: offY + nb.y - 2, w: nb.w + 6, h: nb.h + 4 });
      return;
    }
    // Sem nota nessa corda: interpola a linha (calibrada pelas notas do compasso).
    const { topY, spacing } = stringGeometry(
      bb as unknown as BeatBoundsLike,
      staffStrings,
    );
    const cy = topY + (cursor.string - 1) * spacing;
    setNoteRect({
      x: offX + bb.visualBounds.x - 3,
      y: offY + cy - spacing / 2,
      w: bb.visualBounds.w + 6,
      h: Math.max(spacing, 12),
    });
  }, [cursor, apiReady, raw, renderEpoch, model, trackStringCount]);

  // ── Badges de compasso incompleto/estourado ─────────────────────────────────
  // O editor bloqueia estourar, mas um compasso pode ficar MENOR que a fórmula
  // durante a edição (ou vir estourado de importação/modo texto). Marca cada um
  // direto na tablatura: "falta 1/4" / "passa 1/8".
  useEffect(() => {
    if (!apiReady || raw) {
      setMeasureFlags([]);
      return;
    }
    const api = apiRef.current;
    const lookup = api?.boundsLookup;
    const bars = api?.score?.tracks?.[0]?.staves?.[0]?.bars;
    if (!lookup || !bars) {
      setMeasureFlags([]);
      return;
    }
    const offX = surfaceRef.current?.offsetLeft ?? 0;
    const offY = surfaceRef.current?.offsetTop ?? 0;
    const flags: { x: number; y: number; label: string; kind: "under" | "over" }[] = [];

    model.measures.forEach((m, i) => {
      // Pausa inteira única = compasso vazio/convencional (vale a fórmula toda).
      if (
        m.beats.length === 1 &&
        m.beats[0].isRest &&
        m.beats[0].notes.length === 0 &&
        m.beats[0].duration === 1
      ) {
        return;
      }
      const meta = measureMeta?.[i];
      const cap = capacity64(meta?.tsNum ?? 4, meta?.tsDen ?? 4);
      const used = measureUsed64(m);
      if (Math.abs(used - cap) <= CAP_EPS) return;

      const beat = bars[i]?.voices?.[0]?.beats?.[0];
      const bb = beat ? lookup.findBeat(beat) : null;
      if (!bb) return;
      const barVB = bb.barBounds.visualBounds;
      // Fração exibida: arredonda para o 64avo mais próximo (resíduos de
      // quiáltera viram "≈"); diferença menor que meio 64avo não é exibida.
      const diff = Math.abs(cap - used);
      const d64 = Math.round(diff);
      if (d64 === 0) return;
      const g = gcd(d64, 64);
      const approx = Math.abs(diff - d64) > 0.05 ? "≈" : "";
      const frac = `${approx}${d64 / g}/${64 / g}`;
      flags.push({
        x: offX + barVB.x + 2,
        y: offY + barVB.y + barVB.h + 3,
        label: used < cap ? `falta ${frac}` : `passa ${frac}`,
        kind: used < cap ? "under" : "over",
      });
    });
    setMeasureFlags(flags);
  }, [apiReady, raw, renderEpoch, model, measureMeta]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="tab-editor" style={{ position: "relative" }}>

      {/* ── Cabeçalho: label + toggle ── */}
      <div className="tab-editor-header">
        <span className="tab-editor-section-label">
          {percussion
            ? "Percussão (texto) — edição visual em breve"
            : raw
              ? "Tablatura da faixa (texto)"
              : "Editor visual"}
        </span>
        <div className="tab-editor-header-right">
          {error && <span className="form-error" style={{ fontSize: "0.75rem" }}>{error}</span>}
          {info  && <span className="form-ok"   style={{ fontSize: "0.75rem" }}>{info}</span>}
          {!percussion && (
            <button
              type="button"
              className="tab-editor-raw-toggle"
              onClick={() => setRawMode((m) => !m)}
            >
              {rawMode ? "usar editor visual" : "editar como texto"}
            </button>
          )}
        </div>
      </div>

      {/* ── Toolbar — visível apenas no modo visual ── */}
      {!raw && (
        <div className="tab-editor-toolbar">
          <span className="tab-editor-toolbar-label">Dur.</span>
          <div className="tab-editor-toolbar-group">
            {DURATIONS.map((d) => (
              <button
                key={d.value}
                type="button"
                className={`tab-editor-btn${displayDuration === d.value ? " active" : ""}`}
                title={d.title}
                onClick={() => handleDurationChange(d.value)}
                disabled={disabled}
              >
                {d.label}
              </button>
            ))}
          </div>

          <div className="tab-editor-toolbar-sep" />

          <span className="tab-editor-toolbar-label">Efeito</span>
          <div className="tab-editor-toolbar-group">
            {EFFECTS.map((ef) => (
              <button
                key={ef.value}
                type="button"
                className={`tab-editor-btn${effects.includes(ef.value) ? " effect-active" : ""}`}
                title={ef.title}
                onClick={() => handleEffectToggle(ef.value)}
                disabled={disabled || !cursor || !selectedHasNotes}
              >
                {ef.label}
              </button>
            ))}
            <button
              type="button"
              className={`tab-editor-btn${bendActive ? " effect-active" : ""}`}
              title="Bend — full bend (tom inteiro). Clique de novo para remover."
              onClick={handleBendToggle}
              disabled={disabled || !cursor || !selectedHasNotes}
            >
              B
            </button>
          </div>

          <div className="tab-editor-toolbar-sep" />

          {/* Seletor de corda — escolha a corda, depois digite a casa (0–9). */}
          <span className="tab-editor-toolbar-label">Corda</span>
          <div className="tab-editor-toolbar-group">
            {Array.from({ length: trackStringCount }, (_, i) => i + 1).map((s) => (
              <button
                key={s}
                type="button"
                className={`tab-editor-btn${cursor?.string === s ? " active" : ""}`}
                title={`Corda ${s} (${stringName(s, trackStringCount)})`}
                onClick={() => handleStringSelect(s)}
                disabled={!cursor}
              >
                {stringName(s, trackStringCount)}
              </button>
            ))}
          </div>

          {canEditStructure && (
            <>
              <div className="tab-editor-toolbar-sep" />
              <span className="tab-editor-toolbar-label">Comp.</span>
              <div className="tab-editor-toolbar-group">
                <button
                  type="button"
                  className="tab-editor-btn"
                  title="Inserir um compasso vazio DEPOIS do selecionado (todas as trilhas)"
                  onClick={() => cursor && onAddMeasure?.(cursor.measureIndex)}
                  disabled={disabled || !cursor}
                >
                  +
                </button>
                <button
                  type="button"
                  className="tab-editor-btn"
                  title="Remover o compasso selecionado (todas as trilhas)"
                  onClick={() => cursor && onDeleteMeasure?.(cursor.measureIndex)}
                  disabled={disabled || !cursor}
                >
                  −
                </button>
              </div>
            </>
          )}

          <div className="tab-editor-toolbar-sep" />

          {/* Posição do cursor + fórmula de compasso + avisos */}
          {cursor ? (
            <span className="tab-editor-pos">
              Comp.{" "}<strong>{cursor.measureIndex + 1}</strong>
              {" · "}Beat{" "}<strong>{cursor.beatIndex + 1}</strong>
              {" · "}<strong title={DURATIONS.find((d) => d.value === displayDuration)?.title}>
                1/{displayDuration}
              </strong>
              {fill && (
                <>
                  {" · "}<strong>{fill.num}/{fill.den}</strong>
                  {fill.state === "full" && <span className="tab-editor-chip full"> cheio</span>}
                  {fill.state === "over" && <span className="tab-editor-chip over"> estourado</span>}
                </>
              )}
            </span>
          ) : (
            <span className="tab-editor-pos">Clique numa nota da tablatura para selecionar</span>
          )}

          {warn && <span className="tab-editor-chip warn">{warn}</span>}

          <div className="tab-editor-kbd-hints">
            <span><kbd className="tab-editor-key">0–9</kbd> casa</span>
            <span><kbd className="tab-editor-key">← →</kbd> beat</span>
            <span><kbd className="tab-editor-key">↑ ↓</kbd> corda</span>
            <span><kbd className="tab-editor-key">r</kbd> pausa</span>
            <span><kbd className="tab-editor-key">i</kbd> inserir</span>
            <span><kbd className="tab-editor-key">Del</kbd> apagar</span>
          </div>
        </div>
      )}

      {/* ── Viewport com alphaTab — SEMPRE no DOM ── */}
      <div
        ref={viewportRef}
        className="tab-editor-viewport"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onMouseDownCapture={(e) => {
          // Posição relativa ao surface (mesmo espaço dos bounds do alphaTab) —
          // usada pelo beatMouseDown para saber QUAL CORDA foi clicada.
          const r = surfaceRef.current?.getBoundingClientRect();
          if (r) lastPointerRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
        }}
        aria-label="Editor de tablatura. Clique num número para selecionar e use o teclado para editar."
        style={{ visibility: raw ? "hidden" : "visible" }}
      >
        {!apiReady && !raw && (
          <div className="player-loading">Carregando editor…</div>
        )}
        <div ref={surfaceRef} className="player-surface" />

        {/* Overlay de seleção: coluna do beat + caixa da corda selecionada */}
        {!raw && beatRect && (
          <div
            className="tab-editor-sel-beat"
            style={{ left: beatRect.x, top: beatRect.y, width: beatRect.w, height: beatRect.h }}
          />
        )}
        {!raw && noteRect && (
          <div
            className="tab-editor-sel-note"
            style={{ left: noteRect.x, top: noteRect.y, width: noteRect.w, height: noteRect.h }}
          />
        )}

        {/* Badges de compasso fora do tempo ("falta 1/4" / "passa 1/8") */}
        {!raw &&
          measureFlags.map((f, i) => (
            <span
              key={i}
              className={`tab-editor-measure-flag ${f.kind}`}
              style={{ left: f.x, top: f.y }}
            >
              {f.label}
            </span>
          ))}
      </div>

      {/* ── Overlay do modo texto — cobre o editor visual ── */}
      {raw && (
        <div className="tab-editor-raw-overlay">
          <textarea
            className="edit-textarea"
            value={alphaTex}
            onChange={(e) => {
              lastEmittedRef.current = e.target.value;
              onChange(e.target.value);
              setModel(parseTrackTex(e.target.value));
            }}
            disabled={disabled}
            spellCheck={false}
          />
          <div className="edit-actions">
            {error && <span className="form-error">{error}</span>}
            {info  && <span className="form-ok">{info}</span>}
          </div>
        </div>
      )}
    </div>
  );
});

export default TabEditor;
