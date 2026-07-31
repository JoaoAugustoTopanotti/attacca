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
  type BendAmount,
  type EditorBeat,
  type EditorCursor,
  type EditorModel,
  type NoteEffect,
  beatDots,
  capacity64,
  cloneBeats,
  deleteBeat,
  deleteNote,
  insertBeat,
  measureUsed64,
  moveBeat,
  moveNoteToString,
  noteBendQuarters,
  parseTrackTex,
  replaceBeatsInMeasure,
  serializeForRender,
  serializeModel,
  setBeatDots,
  setBeatDuration,
  setBend,
  setNote,
  setRest,
  toggleEffect,
} from "@/lib/alphatex-editor";
import { alphaTabResources, readTheme } from "@/lib/theme";
import { splitTuningToken, tuningTokensFromHeader } from "@/lib/tuning";

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
  { value: "t",  label: "Lig", title: "Nota ligada (tie: prolonga a nota anterior da mesma corda, sem novo ataque)" },
  { value: "sl", label: "/",  title: "Slide (desliza até a próxima nota)"             },
  { value: "v",  label: "~",  title: "Vibrato"                                        },
  { value: "lr", label: "LR", title: "Let ring (deixa soar)"                          },
  { value: "x",  label: "X",  title: "Nota morta/abafada (corda sem pressionar até o traste)" },
  { value: "pm", label: "PM", title: "Palm mute (abafada com a palma da mão)"         },
  { value: "nh", label: "NH", title: "Harmônico natural"                              },
  { value: "ac", label: ">",  title: "Acento"                                         },
  { value: "st", label: "st", title: "Staccato (nota curta e destacada)"              },
  { value: "g",  label: "g",  title: "Ghost note (nota fantasma, mais fraca)"         },
];

// Efeitos frequentes ficam visíveis na toolbar; os demais moram no menu "mais ▾"
// — na tela, só o que orienta.
const MAIN_EFFECT_VALUES: ReadonlyArray<NoteEffect> = ["h", "p", "t", "sl", "v", "pm"];
const EFFECTS_MAIN = EFFECTS.filter((e) => MAIN_EFFECT_VALUES.includes(e.value));
const EFFECTS_MORE = EFFECTS.filter((e) => !MAIN_EFFECT_VALUES.includes(e.value));

// Tecla → efeito, espelhando os tokens do alphaTex (aprende-se uma vez, vale
// nos dois modos). "r" (pausa) e "i" (inserir) já existem e não colidem.
const KEY_EFFECTS: Record<string, NoteEffect> = {
  h: "h", p: "p", t: "t", s: "sl", v: "v", m: "pm", x: "x",
};

// Distâncias de bend oferecidas na toolbar (valor em QUARTOS de tom do alphaTab).
const BEND_CHOICES: Array<{ quarters: number; label: string; title: string }> = [
  { quarters: 2, label: "½",  title: "Bend de meio tom" },
  { quarters: 4, label: "1",  title: "Bend de um tom (full)" },
  { quarters: 6, label: "1½", title: "Bend de um tom e meio" },
];

// Ciclo da tecla "b": sem bend → ½ → 1 → 1½ → sem bend.
const BEND_CYCLE = [2, 4, 6];

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

// Passos de duração para as teclas +/− ("+" subdivide, convenção GP/Soundslice).
const DUR_STEPS: BeatDuration[] = [1, 2, 4, 8, 16, 32, 64];

// Clipboard de trechos no escopo do MÓDULO: sobrevive à remontagem do componente
// (trocar de trilha usa key={trackOrder}) e permite copiar entre trilhas.
let sharedClipboard: EditorBeat[][] | null = null;

// Posição de um beat na grade (para ordenar seleções âncora↔cursor).
type BeatPos = { measureIndex: number; beatIndex: number };
function orderPos(a: BeatPos, b: BeatPos): [BeatPos, BeatPos] {
  return a.measureIndex < b.measureIndex ||
    (a.measureIndex === b.measureIndex && a.beatIndex <= b.beatIndex)
    ? [a, b]
    : [b, a];
}

/** Corda em que um efeito é aplicado: a do cursor se houver nota nela; senão,
 *  a primeira nota do beat. */
function targetString(beat: EditorBeat, cursorString: number): number {
  if (beat.notes.some((n) => n.string === cursorString)) return cursorString;
  return beat.notes[0]?.string ?? cursorString;
}

/** Prende o cursor a uma posição válida do modelo (pós undo/colar/apagar). */
function clampCursor(
  m: EditorModel,
  c: { measureIndex: number; beatIndex: number; string: number },
): { measureIndex: number; beatIndex: number; string: number } {
  const mi = Math.max(0, Math.min(c.measureIndex, m.measures.length - 1));
  const bi = Math.max(0, Math.min(c.beatIndex, (m.measures[mi]?.beats.length ?? 1) - 1));
  return { measureIndex: mi, beatIndex: bi, string: c.string };
}

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
  /** Andamento inicial da música (bpm) — desenha a marca ♩=N do compasso 1. */
  initialTempo?: number | null;
  /** Espaço no editor → tocar/pausar a música completa (o player é do pai). */
  onPlayPause?: () => void;
  /** Clique num beat → pede seek da música completa para este tick. */
  onSeek?: (tick: number) => void;
  /** Dono da música pode alterar a estrutura (adicionar/remover compassos). */
  canEditStructure?: boolean;
  /**
   * Inserir `count` compassos vazios DEPOIS de measureIndex (todas as trilhas).
   * Resolve false quando a operação não aconteceu (ocupado ou erro).
   */
  onAddMeasure?: (afterMeasureIndex: number, count?: number) => void | Promise<boolean>;
  /** Remover o compasso measureIndex (todas as trilhas). */
  onDeleteMeasure?: (measureIndex: number) => void;
  /** Definir/remover (bpm null) o andamento A PARTIR do compasso measureIndex. */
  onSetMeasureTempo?: (measureIndex: number, bpm: number | null) => void;
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
    initialTempo,
    onPlayPause,
    onSeek,
    canEditStructure = false,
    onAddMeasure,
    onDeleteMeasure,
    onSetMeasureTempo,
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
  const raw = rawMode;
  // Incrementado a cada render do alphaTab; dispara o recálculo dos overlays.
  const [renderEpoch, setRenderEpoch] = useState(0);
  // Aviso transitório de ação bloqueada (compasso cheio, corda ocupada).
  const [warn, setWarn] = useState<string | null>(null);
  // Confirmação transitória (copiado/colado): chip informativo, não erro.
  const [flash, setFlash] = useState<string | null>(null);
  // Âncora da seleção de trecho (Shift+setas / Shift+clique). Range = âncora↔cursor.
  const [selAnchor, setSelAnchor] = useState<BeatPos | null>(null);
  // Overlay de seleção: coluna do beat + caixa da corda selecionada.
  const [beatRect, setBeatRect] = useState<Rect | null>(null);
  const [noteRect, setNoteRect] = useState<Rect | null>(null);
  // Retângulos do trecho selecionado (um por beat do range âncora↔cursor).
  const [selRects, setSelRects] = useState<Rect[]>([]);
  // Badges de compasso incompleto/estourado (posicionados sobre a tablatura).
  const [measureFlags, setMeasureFlags] = useState<
    { x: number; y: number; label: string; kind: "under" | "over" }[]
  >([]);
  // Botão "+" ao final de cada compasso, para inserir um vazio logo depois.
  const [addSlots, setAddSlots] = useState<{ x: number; y: number; measureIndex: number }[]>([]);
  // Letras da afinação por corda à esquerda do 1º compasso (estilo Songsterr).
  const [tuningLabels, setTuningLabels] = useState<{ x: number; y: number; label: string }[]>([]);
  // Popover "andamento a partir deste compasso", ancorado na marca ♩=N ou no
  // menu do compasso que o abriu (dono).
  const [tempoPop, setTempoPop] = useState<
    { measureIndex: number; x: number; y: number } | null
  >(null);
  const [tempoPopVal, setTempoPopVal] = useState("");
  // Alvos clicáveis sobre as marcas ♩=N desenhadas na partitura (dono).
  // bpm null = compasso 1 sem andamento: marca-fantasma "♩ = ?" para definir.
  const [tempoMarks, setTempoMarks] = useState<
    { x: number; y: number; measureIndex: number; bpm: number | null }[]
  >([]);
  // Números de compasso clicáveis (dono): abrem o menu de ações do compasso.
  const [measureNums, setMeasureNums] = useState<
    { x: number; y: number; measureIndex: number }[]
  >([]);
  const [measureMenu, setMeasureMenu] = useState<
    { measureIndex: number; x: number; y: number } | null
  >(null);
  // Menus da toolbar (Bend ▾ / mais ▾) e o painel de atalhos.
  const [bendPopOpen, setBendPopOpen] = useState(false);
  const [morePopOpen, setMorePopOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Refs para evitar closures obsoletas nos handlers do alphaTab, registrados
  // uma única vez na montagem.
  const modelRef  = useRef<EditorModel>(model);
  const cursorRef = useRef<EditorCursor>(cursor);
  const surfaceRef  = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<AlphaTabApi | null>(null);
  const prevRawModeRef = useRef(false);
  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selAnchorRef = useRef<BeatPos | null>(null);
  // Undo/redo: pilhas de modelos. A edição é imutável, então guardar
  // referências de estados anteriores é barato.
  const historyRef = useRef<{ past: EditorModel[]; future: EditorModel[] }>({
    past: [],
    future: [],
  });
  // Último dígito digitado (para casas de dois dígitos).
  const lastDigitRef = useRef<
    { time: number; measureIndex: number; beatIndex: number; string: number; value: number } | null
  >(null);
  // Posição do último mousedown, relativa ao surface (mesmo espaço dos bounds
  // do alphaTab). Permite clicar em qualquer corda do beat, não só onde há
  // nota; `shift` registra Shift+clique para estender a seleção.
  const lastPointerRef = useRef<{ x: number; y: number; shift: boolean } | null>(null);
  // Contexto de render e callbacks sempre atuais para os handlers.
  const trackHeaderRef = useRef(trackHeader);
  const measureMetaRef = useRef(measureMeta);
  const initialTempoRef = useRef(initialTempo);
  const onSeekRef = useRef(onSeek);
  const stringCountRef = useRef(trackStringCount);
  trackHeaderRef.current = trackHeader;
  measureMetaRef.current = measureMeta;
  initialTempoRef.current = initialTempo;
  onSeekRef.current = onSeek;
  stringCountRef.current = trackStringCount;
  // Último alphaTex emitido daqui: distingue mudança externa (refetch, aceite de
  // proposta) do eco da nossa própria edição.
  const lastEmittedRef = useRef(alphaTex);
  // Cursor a restaurar na PRÓXIMA mudança externa: "i" num compasso cheio cria
  // um compasso novo via onAddMeasure (refetch assíncrono) e o cursor deve cair
  // nele, não voltar a null.
  const pendingCursorRef = useRef<{ measureIndex: number; beatIndex: number; string: number } | null>(null);
  // Colagem/repetição de compassos inteiros que não coube na grade: os compassos
  // que faltavam foram pedidos ao servidor (onAddMeasure) e o trecho entra
  // sozinho quando a grade nova chega. Copiar 3 compassos e parar num aviso
  // "adicione compassos antes de colar" obrigava a contar na mão o que falta.
  const pendingWriteRef = useRef<{
    startMi: number;
    chunks: EditorBeat[][];
    string: number;
    /** Nº de compassos esperado depois do crescimento: identifica a grade certa. */
    expected: number;
    label: string;
  } | null>(null);
  // Aplica a escrita pendente na grade recém-chegada (true = aplicou). Atribuída
  // mais abaixo, onde os helpers já existem — o effect de mudança externa é
  // declarado antes deles e não pode citá-los nas dependências (TDZ).
  const applyPendingWriteRef = useRef<((m: EditorModel) => boolean) | null>(null);
  // Módulo do alphaTab importado na montagem (enums usados em effects depois).
  const atModuleRef = useRef<AlphaTabModule | null>(null);
  // Um render por vez (ver loadTex): render no ar + tex novo na fila.
  const renderBusyRef = useRef(false);
  const pendingTexRef = useRef<string | null>(null);
  const renderWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { modelRef.current = model; }, [model]);
  useEffect(() => { cursorRef.current = cursor; }, [cursor]);
  useEffect(() => { selAnchorRef.current = selAnchor; }, [selAnchor]);

  // alphaTex renderizável: documento real de uma trilha (ver serializeForRender).
  const renderTex = useCallback((m: EditorModel) => {
    return serializeForRender(m, {
      trackHeader: trackHeaderRef.current,
      structPrefixes: measureMetaRef.current?.map((mm) => mm.structPrefix),
      initialTempo: initialTempoRef.current,
    });
  }, []);

  // Único caminho para trocar o score do alphaTab: UM render por vez, com o
  // último tex pedido vencendo a fila.
  // ⚠️ Trocar o score enquanto um render está no ar é corrida: o render acontece
  // no Web Worker e, ao terminar, o alphaTab remapeia os bounds no score ATUAL
  // por índice de compasso (`BoundsLookup.fromJson`). Se o score novo tem menos
  // compassos (remover compasso), o índice velho não existe mais e estoura
  // "Cannot read properties of undefined (reading 'voices')" — fora do
  // api.error, direto no handler da mensagem do worker.
  const loadTex = useCallback((tex: string) => {
    const api = apiRef.current;
    if (!api) return;
    if (renderBusyRef.current) {
      pendingTexRef.current = tex;
      return;
    }
    renderBusyRef.current = true;
    // Rede de segurança: se um render não chegar ao postRenderFinished (erro de
    // parse, por exemplo), a fila não pode travar o editor para sempre.
    if (renderWatchdogRef.current) clearTimeout(renderWatchdogRef.current);
    renderWatchdogRef.current = setTimeout(() => {
      renderBusyRef.current = false;
      const queued = pendingTexRef.current;
      pendingTexRef.current = null;
      if (queued !== null) loadTexRef.current?.(queued);
    }, 1500);
    api.tex(tex);
  }, []);
  // O handler do alphaTab é registrado uma vez na montagem e o watchdog se
  // rechama: os dois precisam da versão atual de loadTex.
  const loadTexRef = useRef(loadTex);
  loadTexRef.current = loadTex;

  // ── Mudança estrutural vinda do pai (afinação, andamento, meta) ─────────────
  // O alphaTex das células não muda, então o effect de mudança externa não
  // dispara. Re-renderiza o alphaTab em-place, sem remontar o editor: preserva
  // cursor e histórico, e evita o travamento visível de uma remontagem inteira.
  const structSigRef = useRef<string | null>(null);
  useEffect(() => {
    const sig =
      `${trackHeader ?? ""}©${initialTempo ?? ""}©` +
      (measureMeta ?? [])
        .map((m) => `${m.tsNum}/${m.tsDen}:${m.structPrefix ?? ""}`)
        .join("|");
    // Adicionar/remover compasso muda a meta E o alphaTex no mesmo commit: quem
    // renderiza é o effect de mudança externa, com o modelo novo. Renderizar
    // aqui também produziria um score intermediário errado (modelo antigo + meta
    // nova), trocado no mesmo tick — o render de sobra é justamente o que
    // devolvia bounds de compassos que já não existem.
    const externalPending = alphaTex !== lastEmittedRef.current;
    if (structSigRef.current !== null && structSigRef.current !== sig && !externalPending) {
      loadTex(renderTex(modelRef.current));
    }
    structSigRef.current = sig;
  }, [alphaTex, trackHeader, measureMeta, initialTempo, renderTex, loadTex]);

  // Cursor de playback: o pai encaminha o tick do player headless, e definir
  // `tickPosition` move o cursor do editor sem produzir áudio.
  useImperativeHandle(ref, () => ({
    seekTick: (tick: number) => {
      const api = apiRef.current;
      if (api) api.tickPosition = tick;
    },
  }), []);

  // ── Mudança externa do alphaTex (refetch pós-save, aceite de proposta) ──────
  // Prop mudou sem ser eco do nosso onChange: re-sincroniza modelo e render.
  useEffect(() => {
    if (alphaTex !== lastEmittedRef.current) {
      lastEmittedRef.current = alphaTex;
      const m = parseTrackTex(alphaTex);
      // Colagem/repetição esperando os compassos que faltavam: se a grade veio
      // com o tamanho pedido, o trecho entra agora, em vez de sumir.
      if (applyPendingWriteRef.current?.(m)) return;
      setModel(m);
      const pending = pendingCursorRef.current;
      pendingCursorRef.current = null;
      setCursor(pending ? clampCursor(m, pending) : null);
      setSelAnchor(null);
      historyRef.current = { past: [], future: [] };
      loadTex(renderTex(m));
    }
  }, [alphaTex, renderTex, loadTex]);

  // ── Volta do modo texto: re-renderiza o alphaTab com o modelo atual ─────────
  useEffect(() => {
    if (!rawMode && prevRawModeRef.current && apiRef.current) {
      loadTex(renderTex(modelRef.current));
    }
    prevRawModeRef.current = rawMode;
  }, [rawMode, renderTex, loadTex]);

  // ── Inicialização do alphaTab (uma vez na montagem) ────────────────────────
  useEffect(() => {
    let api: AlphaTabApi | null = null;
    let disposed = false;

    (async () => {
      const at = await import("@coderline/alphatab");
      if (disposed || !surfaceRef.current) return;
      atModuleRef.current = at;

      api = new at.AlphaTabApi(surfaceRef.current, {
        core: {
          fontDirectory: "/font/",
          // Exigido por noteMouseDown e pelos NoteBounds usados nos overlays.
          includeNoteBounds: true,
        },
        display: {
          staveProfile: "Tab",
          scale: 1.0,
          // O alphaTab desenha em canvas próprio e não herda CSS: as cores da
          // tablatura vêm do tema por aqui.
          resources: alphaTabResources(readTheme()),
        },
        notation: {
          // Desliga o texto "Guitar Standard Tuning": a afinação é desenhada
          // como letras por corda à esquerda do 1º compasso. Para o dono, o
          // número de compasso do alphaTab também sai — no lugar dele entra o
          // overlay clicável "N ▾" com o menu de ações do compasso.
          elements: canEditStructure
            ? new Map([
                [at.NotationElement.GuitarTuning, false],
                [at.NotationElement.BarNumber, false],
              ])
            : new Map([[at.NotationElement.GuitarTuning, false]]),
          // Sem notação de ritmo abaixo da tab (rhythmMode fica no default):
          // as hastes descendo de cada nota ficaram feias — decisão do João
          // (2026-07-30). Duração/pontuado ficam na toolbar e na barra de status.
        },
        player: {
          enablePlayer:          true,
          enableCursor:          true,   // mostra onde a música está tocando
          enableUserInteraction: true,   // habilita beatMouseDown/noteMouseDown
          soundFont:             "/soundfont/sonivox.sf2",
          scrollElement:         viewportRef.current ?? undefined,
          scrollMode:            at.ScrollMode.Continuous,
        },
      });

      api.scoreLoaded.on(() => {
        setApiReady(true);
        requestAnimationFrame(() => viewportRef.current?.focus());
      });

      // Render que não veio do loadTex (resize do container, por exemplo) também
      // segura a fila: trocar o score no meio dele cairia na mesma corrida.
      api.renderStarted.on(() => { renderBusyRef.current = true; });

      // Os bounds mudam a cada re-render: recalcula os overlays. Aqui também
      // libera a fila de loadTex — o score só troca entre renders.
      api.postRenderFinished.on(() => {
        if (renderWatchdogRef.current) {
          clearTimeout(renderWatchdogRef.current);
          renderWatchdogRef.current = null;
        }
        renderBusyRef.current = false;
        const queued = pendingTexRef.current;
        pendingTexRef.current = null;
        if (queued !== null) loadTexRef.current(queued);
        setRenderEpoch((e) => e + 1);
      });

      // Dispara em qualquer beat, com notas ou pausa: move o cursor e pede o
      // seek da música completa para o tick clicado.
      api.beatMouseDown.on((beat) => {
        const measureIndex = beat.voice.bar.index;
        const mod = modelRef.current;
        const measure = mod.measures[measureIndex];
        if (!measure) return;
        // As vozes 1+ são opacas no editor: mapeia para o beat mais próximo da
        // voz 0 em vez de usar um índice de outra voz.
        const beatIndex = Math.max(
          0,
          Math.min(beat.index, measure.beats.length - 1),
        );
        // Corda escolhida pelo Y do clique, o que permite selecionar qualquer
        // linha do tab, inclusive vazia. noteMouseDown refina em seguida.
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
        // Shift+clique estende a seleção a partir do cursor anterior; o clique
        // normal desfaz qualquer seleção de trecho.
        const prevCur = cursorRef.current;
        if (ptr?.shift && prevCur) {
          if (!selAnchorRef.current) {
            setSelAnchor({
              measureIndex: prevCur.measureIndex,
              beatIndex: prevCur.beatIndex,
            });
          }
        } else {
          setSelAnchor(null);
        }
        setCursor({ measureIndex, beatIndex, string });
        // Reposiciona a música completa neste ponto, tocando ou pausada.
        const tick =
          (beat as unknown as { absolutePlaybackStart?: number }).absolutePlaybackStart ??
          beat.voice.bar.masterBar.start + beat.playbackStart;
        onSeekRef.current?.(tick);
        viewportRef.current?.focus();
      });

      // Refina a corda quando o clique caiu sobre um número de casa.
      // Atenção à conversão: o modelo do alphaTab numera a corda 1 como a mais
      // GRAVE, enquanto o alphaTex numera 1 como a mais AGUDA. Sem converter, o
      // clique seleciona a corda espelhada.
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
        // Render que falhou não chega ao postRenderFinished: libera a fila aqui,
        // senão o editor pararia de refletir as edições seguintes.
        renderBusyRef.current = false;
        const queued = pendingTexRef.current;
        pendingTexRef.current = null;
        if (queued !== null) loadTexRef.current(queued);
      });

      apiRef.current = api;
      loadTexRef.current(renderTex(modelRef.current));
    })();

    return () => {
      disposed = true;
      apiRef.current = null;
      if (renderWatchdogRef.current) clearTimeout(renderWatchdogRef.current);
      api?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Só na montagem: o pai usa key={trackOrder} para remontar ao trocar de trilha

  // ── Aplicar edição ao alphaTab e notificar o pai ───────────────────────────
  // `applyModelRaw` não mexe no histórico (usado por undo/redo); `applyModel` é
  // o caminho de toda edição do usuário e empilha o estado anterior.
  const applyModelRaw = useCallback(
    (newModel: EditorModel) => {
      const tex = serializeModel(newModel);
      lastEmittedRef.current = tex;
      setModel(newModel);
      onChange(tex);
      // Pela fila: digitação rápida deixa de empilhar um render por tecla no
      // worker — vale o último modelo.
      loadTex(renderTex(newModel));
    },
    [onChange, renderTex, loadTex],
  );

  const applyModel = useCallback(
    (newModel: EditorModel) => {
      const h = historyRef.current;
      h.past.push(modelRef.current);
      if (h.past.length > 200) h.past.shift();
      h.future = [];
      applyModelRaw(newModel);
    },
    [applyModelRaw],
  );

  // ── Avisos transitórios (warn = bloqueio, flash = confirmação) ──────────────
  const showWarn = useCallback((message: string) => {
    setWarn(message);
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
    warnTimerRef.current = setTimeout(() => setWarn(null), 2200);
  }, []);
  const showFlash = useCallback((message: string) => {
    setFlash(message);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlash(null), 2600);
  }, []);
  useEffect(() => () => {
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
  }, []);

  // ── Capacidade do compasso (fórmula de compasso) ────────────────────────────
  const measureTs = useCallback((measureIndex: number): { num: number; den: number } => {
    const meta = measureMetaRef.current?.[measureIndex];
    return { num: meta?.tsNum ?? 4, den: meta?.tsDen ?? 4 };
  }, []);

  // Regra de capacidade: bloqueia apenas o que aumenta o compasso para além da
  // fórmula. Reduzir um compasso já estourado é sempre permitido.
  const wouldOverflow = useCallback(
    (oldModel: EditorModel, newModel: EditorModel, measureIndex: number): boolean => {
      const { num, den } = measureTs(measureIndex);
      const cap = capacity64(num, den);
      const oldUsed = measureUsed64(oldModel.measures[measureIndex]);
      const newUsed = measureUsed64(newModel.measures[measureIndex]);
      return newUsed > cap + CAP_EPS && newUsed >= oldUsed - CAP_EPS;
    },
    [measureTs],
  );

  // ── Duração ────────────────────────────────────────────────────────────────
  const handleDurationChange = useCallback(
    (d: BeatDuration) => {
      setDuration(d);
      if (disabled) return;
      const cur = cursorRef.current;
      const mod = modelRef.current;
      if (!cur) return;
      const measure = mod.measures[cur.measureIndex];
      const beat = measure?.beats[cur.beatIndex];
      if (!measure || !beat || beat.duration === d) return;
      const trial = setBeatDuration(mod, cur.measureIndex, cur.beatIndex, d);
      if (wouldOverflow(mod, trial, cur.measureIndex)) {
        const { num, den } = measureTs(cur.measureIndex);
        showWarn(`Não cabe no compasso (${num}/${den}) — encurte outro beat primeiro.`);
        return;
      }
      applyModel(trial);
    },
    [applyModel, disabled, measureTs, showWarn, wouldOverflow],
  );

  // Teclas +/− : "+" subdivide (mais curta), "−" alonga — convenção GP/Soundslice.
  const stepDuration = useCallback(
    (dir: -1 | 1) => {
      const cur = cursorRef.current;
      const mod = modelRef.current;
      const d = cur ? mod.measures[cur.measureIndex]?.beats[cur.beatIndex]?.duration : undefined;
      if (!d) return;
      const idx = DUR_STEPS.indexOf(d) + dir;
      if (idx < 0 || idx >= DUR_STEPS.length) return;
      handleDurationChange(DUR_STEPS[idx]);
    },
    [handleDurationChange],
  );

  // ── Pontuado ("." simples / Ctrl+"." duplo / botões · ··) ───────────────────
  const applyDots = useCallback(
    (dots: 0 | 1 | 2) => {
      if (disabled) return;
      const cur = cursorRef.current;
      const mod = modelRef.current;
      if (!cur) return;
      const beat = mod.measures[cur.measureIndex]?.beats[cur.beatIndex];
      if (!beat || beatDots(beat) === dots) return;
      const trial = setBeatDots(mod, cur.measureIndex, cur.beatIndex, dots);
      if (wouldOverflow(mod, trial, cur.measureIndex)) {
        const { num, den } = measureTs(cur.measureIndex);
        showWarn(`O ponto não cabe no compasso (${num}/${den}) — encurte um beat antes.`);
        return;
      }
      applyModel(trial);
    },
    [applyModel, disabled, measureTs, showWarn, wouldOverflow],
  );

  // ── Seleção de trecho (âncora↔cursor) e clipboard ──────────────────────────
  /** Range atual ordenado + beats clonados, agrupados por compasso. */
  const getSelection = useCallback((): {
    start: BeatPos;
    end: BeatPos;
    chunks: EditorBeat[][];
  } | null => {
    const cur = cursorRef.current;
    if (!cur) return null;
    const mod = modelRef.current;
    const pos: BeatPos = { measureIndex: cur.measureIndex, beatIndex: cur.beatIndex };
    const [start, end] = orderPos(selAnchorRef.current ?? pos, pos);
    const chunks: EditorBeat[][] = [];
    for (let mi = start.measureIndex; mi <= end.measureIndex; mi++) {
      const beats = mod.measures[mi]?.beats ?? [];
      const from = mi === start.measureIndex ? start.beatIndex : 0;
      const to = mi === end.measureIndex ? end.beatIndex : beats.length - 1;
      chunks.push(cloneBeats(beats.slice(from, to + 1)));
    }
    return { start, end, chunks };
  }, []);

  /** Remove os beats do range (Ctrl+X e Delete numa seleção). */
  const deleteRange = useCallback((mod: EditorModel, start: BeatPos, end: BeatPos): EditorModel => {
    let next = mod;
    for (let mi = end.measureIndex; mi >= start.measureIndex; mi--) {
      const beats = next.measures[mi]?.beats ?? [];
      const from = mi === start.measureIndex ? start.beatIndex : 0;
      const to = mi === end.measureIndex ? end.beatIndex : beats.length - 1;
      next = replaceBeatsInMeasure(next, mi, from, to - from + 1, []);
    }
    return next;
  }, []);

  const doCopy = useCallback(
    (cut: boolean) => {
      const sel = getSelection();
      const cur = cursorRef.current;
      if (!sel || !cur) return;
      sharedClipboard = sel.chunks;
      const n = sel.chunks.reduce((s, c) => s + c.length, 0);
      if (cut && !disabled) {
        const next = deleteRange(modelRef.current, sel.start, sel.end);
        applyModel(next);
        setSelAnchor(null);
        setCursor(clampCursor(next, { ...sel.start, string: cur.string }));
        showFlash(n === 1 ? "1 beat recortado" : `${n} beats recortados`);
      } else {
        showFlash(
          n === 1
            ? "1 beat copiado — clique no destino e Ctrl+V"
            : `${n} beats copiados — clique no destino e Ctrl+V`,
        );
      }
    },
    [applyModel, deleteRange, disabled, getSelection, showFlash],
  );

  /**
   * Escreve compassos inteiros a partir de `startMi`, um chunk por compasso.
   * Devolve o modelo novo ou o índice do compasso que estouraria a fórmula.
   */
  const writeMeasureChunks = useCallback(
    (
      mod: EditorModel,
      startMi: number,
      chunks: EditorBeat[][],
    ): { model: EditorModel } | { overflowAt: number } => {
      let trial = mod;
      for (let k = 0; k < chunks.length; k++) {
        const mi = startMi + k;
        trial = replaceBeatsInMeasure(trial, mi, 0, trial.measures[mi].beats.length, chunks[k]);
      }
      for (let k = 0; k < chunks.length; k++) {
        if (wouldOverflow(mod, trial, startMi + k)) return { overflowAt: startMi + k };
      }
      return { model: trial };
    },
    [wouldOverflow],
  );

  /**
   * O trecho não cabe na grade atual: pede os compassos que faltam e deixa a
   * escrita pendente para quando a grade nova chegar. Devolve false sempre —
   * quem chamou não escreve agora.
   */
  const requestMeasuresFor = useCallback(
    (startMi: number, chunks: EditorBeat[][], string: number, label: string): false => {
      const mod = modelRef.current;
      const missing = startMi + chunks.length - mod.measures.length;
      // Espelha MAX_MEASURES_PER_ADD do servidor (lib/measures.ts não pode vir
      // para o cliente: importa o Prisma).
      if (missing > 64) {
        showWarn(`Faltam ${missing} compassos — a criação em lote vai até 64 por vez.`);
        return false;
      }
      if (!canEditStructure || !onAddMeasure) {
        showWarn(
          `Não cabem ${chunks.length} compassos a partir do ${startMi + 1} — só o dono pode adicionar compassos.`,
        );
        return false;
      }
      pendingWriteRef.current = {
        startMi,
        chunks,
        string,
        expected: mod.measures.length + missing,
        label,
      };
      showFlash(
        missing === 1
          ? `Criando 1 compasso para a ${label}…`
          : `Criando ${missing} compassos para a ${label}…`,
      );
      // Cresce pelo fim: os compassos que faltam entram depois do último.
      void Promise.resolve(onAddMeasure(mod.measures.length - 1, missing)).then((ok) => {
        if (ok === false) {
          pendingWriteRef.current = null;
          showWarn("Não deu para adicionar os compassos — tente de novo.");
        }
      });
      return false;
    },
    [canEditStructure, onAddMeasure, showFlash, showWarn],
  );

  // Chegou grade nova: escreve o trecho que estava esperando os compassos.
  applyPendingWriteRef.current = (m: EditorModel): boolean => {
    const write = pendingWriteRef.current;
    pendingWriteRef.current = null;
    if (!write || m.measures.length !== write.expected) return false;
    const written = writeMeasureChunks(m, write.startMi, write.chunks);
    if ("overflowAt" in written) {
      showWarn(
        `A ${write.label} não coube no compasso ${written.overflowAt + 1} — ` +
          "os compassos novos ficaram vazios.",
      );
      return false;
    }
    // O histórico começa na grade vazia: Ctrl+Z desfaz a colagem, não a criação
    // dos compassos (essa é estrutural e já está gravada).
    historyRef.current = { past: [m], future: [] };
    applyModelRaw(written.model);
    setSelAnchor({ measureIndex: write.startMi, beatIndex: 0 });
    setCursor(
      clampCursor(written.model, {
        measureIndex: write.startMi + write.chunks.length - 1,
        beatIndex: Math.max(0, write.chunks[write.chunks.length - 1].length - 1),
        string: write.string,
      }),
    );
    showFlash(
      write.chunks.length === 1
        ? "1 compasso colado no compasso novo"
        : `${write.chunks.length} compassos colados nos compassos novos`,
    );
    return true;
  };

  // Colar: 1 compasso de origem → substitui a seleção (ou o beat do cursor);
  // vários compassos → substitui compassos inteiros a partir do cursor,
  // criando os que faltarem no fim da música.
  const doPaste = useCallback(() => {
    if (disabled) return;
    const cur = cursorRef.current;
    const mod = modelRef.current;
    if (!cur) return;
    const clip = sharedClipboard;
    if (!clip || clip.length === 0) {
      showWarn("Nada copiado ainda — selecione um trecho e Ctrl+C.");
      return;
    }

    if (clip.length === 1) {
      const anchor = selAnchorRef.current;
      const mi = cur.measureIndex;
      let from = cur.beatIndex;
      let delCount = 1;
      if (anchor && anchor.measureIndex === mi) {
        from = Math.min(anchor.beatIndex, cur.beatIndex);
        delCount = Math.abs(anchor.beatIndex - cur.beatIndex) + 1;
      }
      const trial = replaceBeatsInMeasure(mod, mi, from, delCount, clip[0]);
      if (trial === mod) return;
      if (wouldOverflow(mod, trial, mi)) {
        const { num, den } = measureTs(mi);
        showWarn(
          `Não cabe no compasso ${mi + 1} (${num}/${den}) — selecione o trecho a substituir ou apague beats antes.`,
        );
        return;
      }
      applyModel(trial);
      setSelAnchor(clip[0].length > 1 ? { measureIndex: mi, beatIndex: from } : null);
      setCursor({ measureIndex: mi, beatIndex: from + Math.max(0, clip[0].length - 1), string: cur.string });
      return;
    }

    const startMi = cur.measureIndex;
    if (startMi + clip.length > mod.measures.length) {
      // Faltam compassos: cria e cola quando a grade nova chegar.
      requestMeasuresFor(startMi, clip, cur.string, "colagem");
      return;
    }
    const written = writeMeasureChunks(mod, startMi, clip);
    if ("overflowAt" in written) {
      const { num, den } = measureTs(written.overflowAt);
      showWarn(`A colagem não cabe no compasso ${written.overflowAt + 1} (${num}/${den}).`);
      return;
    }
    applyModel(written.model);
    setSelAnchor({ measureIndex: startMi, beatIndex: 0 });
    setCursor({
      measureIndex: startMi + clip.length - 1,
      beatIndex: Math.max(0, clip[clip.length - 1].length - 1),
      string: cur.string,
    });
  }, [
    applyModel, disabled, measureTs, requestMeasuresFor, showWarn, wouldOverflow,
    writeMeasureChunks,
  ]);

  // Ctrl+D repete a seleção logo adiante. É o "R" do MuseScore/Flat, mapeado em
  // Ctrl+D porque "r" já insere pausa, pela convenção do Guitar Pro.
  const doRepeat = useCallback(() => {
    if (disabled) return;
    const sel = getSelection();
    const cur = cursorRef.current;
    const mod = modelRef.current;
    if (!sel || !cur) return;
    const { start, end, chunks } = sel;
    const endMeasure = mod.measures[end.measureIndex];
    if (!endMeasure) return;
    const wholeMeasures = start.beatIndex === 0 && end.beatIndex === endMeasure.beats.length - 1;

    // Trecho parcial dentro de um compasso: insere a cópia logo após a seleção.
    if (chunks.length === 1 && !wholeMeasures) {
      const mi = start.measureIndex;
      const trial = replaceBeatsInMeasure(mod, mi, end.beatIndex + 1, 0, chunks[0]);
      if (trial === mod) return;
      if (wouldOverflow(mod, trial, mi)) {
        const { num, den } = measureTs(mi);
        showWarn(`A repetição não cabe no compasso ${mi + 1} (${num}/${den}).`);
        return;
      }
      applyModel(trial);
      setSelAnchor({ measureIndex: mi, beatIndex: end.beatIndex + 1 });
      setCursor({ measureIndex: mi, beatIndex: end.beatIndex + chunks[0].length, string: cur.string });
      return;
    }

    if (!wholeMeasures) {
      showWarn("Para repetir um trecho de vários compassos, selecione os compassos inteiros.");
      return;
    }
    const targetStart = end.measureIndex + 1;
    if (targetStart + chunks.length > mod.measures.length) {
      // Repetir adiante é o gesto de compor: cria os compassos que faltam.
      requestMeasuresFor(targetStart, chunks, cur.string, "repetição");
      return;
    }
    const written = writeMeasureChunks(mod, targetStart, chunks);
    if ("overflowAt" in written) {
      const { num, den } = measureTs(written.overflowAt);
      showWarn(`A repetição não cabe no compasso ${written.overflowAt + 1} (${num}/${den}).`);
      return;
    }
    applyModel(written.model);
    setSelAnchor({ measureIndex: targetStart, beatIndex: 0 });
    setCursor({
      measureIndex: targetStart + chunks.length - 1,
      beatIndex: Math.max(0, chunks[chunks.length - 1].length - 1),
      string: cur.string,
    });
  }, [
    applyModel, disabled, getSelection, measureTs, requestMeasuresFor, showWarn,
    wouldOverflow, writeMeasureChunks,
  ]);

  // ── Undo / redo ─────────────────────────────────────────────────────────────
  const doUndo = useCallback(() => {
    const h = historyRef.current;
    const prev = h.past.pop();
    if (!prev) {
      showFlash("Nada para desfazer");
      return;
    }
    h.future.push(modelRef.current);
    applyModelRaw(prev);
    setSelAnchor(null);
    const cur = cursorRef.current;
    if (cur) setCursor(clampCursor(prev, cur));
  }, [applyModelRaw, showFlash]);

  const doRedo = useCallback(() => {
    const h = historyRef.current;
    const nextModel = h.future.pop();
    if (!nextModel) return;
    h.past.push(modelRef.current);
    applyModelRaw(nextModel);
    setSelAnchor(null);
    const cur = cursorRef.current;
    if (cur) setCursor(clampCursor(nextModel, cur));
  }, [applyModelRaw]);

  // ── Mover beat no tempo (Alt+←/→) ───────────────────────────────────────────
  const doMoveBeat = useCallback(
    (dir: -1 | 1) => {
      if (disabled) return;
      const cur = cursorRef.current;
      const mod = modelRef.current;
      if (!cur) return;
      const res = moveBeat(mod, cur.measureIndex, cur.beatIndex, dir);
      if (!res) return;
      if (res.measureIndex !== cur.measureIndex && wouldOverflow(mod, res.model, res.measureIndex)) {
        const { num, den } = measureTs(res.measureIndex);
        showWarn(`O beat não cabe no compasso ${res.measureIndex + 1} (${num}/${den}).`);
        return;
      }
      applyModel(res.model);
      setSelAnchor(null);
      setCursor({ measureIndex: res.measureIndex, beatIndex: res.beatIndex, string: cur.string });
    },
    [applyModel, disabled, measureTs, showWarn, wouldOverflow],
  );

  // ── Mover nota entre cordas (Shift+↑/↓, mesma casa) ─────────────────────────
  const doMoveNoteString = useCallback(
    (dir: -1 | 1) => {
      if (disabled) return;
      const cur = cursorRef.current;
      const mod = modelRef.current;
      if (!cur) return;
      const target = cur.string + dir;
      if (target < 1 || target > stringCountRef.current) return;
      const beat = mod.measures[cur.measureIndex]?.beats[cur.beatIndex];
      if (!beat?.notes.some((n) => n.string === cur.string)) {
        showWarn(`Sem nota na corda ${cur.string} para mover — use ↑↓ sem Shift para trocar de corda.`);
        return;
      }
      const next = moveNoteToString(mod, cur.measureIndex, cur.beatIndex, cur.string, target);
      if (next === mod) {
        showWarn("Já existe nota na corda de destino.");
        return;
      }
      applyModel(next);
      setCursor({ ...cur, string: target });
    },
    [applyModel, disabled, showWarn],
  );

  // ── Efeitos ────────────────────────────────────────────────────────────────
  const handleEffectToggle = useCallback(
    (effect: NoteEffect) => {
      if (disabled) return;
      const cur = cursorRef.current;
      const mod = modelRef.current;
      if (!cur) return;
      const beat = mod.measures[cur.measureIndex]?.beats[cur.beatIndex];
      if (!beat || beat.notes.length === 0) return;
      const string = targetString(beat, cur.string);
      if (string !== cur.string) setCursor({ ...cur, string });
      applyModel(toggleEffect(mod, cur.measureIndex, cur.beatIndex, string, effect));
    },
    [applyModel, disabled],
  );

  // Bend não é um toggle simples: mora no suffix da nota e carrega uma
  // distância. Clicar numa distância aplica-a; clicar na já ativa remove.
  const handleBendSet = useCallback(
    (quarters: number) => {
      if (disabled) return;
      const cur = cursorRef.current;
      const mod = modelRef.current;
      if (!cur) return;
      const beat = mod.measures[cur.measureIndex]?.beats[cur.beatIndex];
      if (!beat || beat.notes.length === 0) return;
      const string = targetString(beat, cur.string);
      if (string !== cur.string) setCursor({ ...cur, string });
      const current = noteBendQuarters(mod, cur.measureIndex, cur.beatIndex, string);
      applyModel(
        setBend(
          mod,
          cur.measureIndex,
          cur.beatIndex,
          string,
          current === quarters ? null : quarters,
        ),
      );
    },
    [applyModel, disabled],
  );

  // Tecla "b": cicla as distâncias (sem → ½ → 1 → 1½ → sem). Bend importado
  // com curva própria ("custom") recomeça em ½ — a curva é substituída.
  const cycleBend = useCallback(() => {
    if (disabled) return;
    const cur = cursorRef.current;
    const mod = modelRef.current;
    if (!cur) return;
    const beat = mod.measures[cur.measureIndex]?.beats[cur.beatIndex];
    if (!beat || beat.notes.length === 0) return;
    const string = targetString(beat, cur.string);
    if (string !== cur.string) setCursor({ ...cur, string });
    const current = noteBendQuarters(mod, cur.measureIndex, cur.beatIndex, string);
    const idx = typeof current === "number" ? BEND_CYCLE.indexOf(current) : -1;
    const next =
      current === null ? BEND_CYCLE[0]
      : idx === -1 ? BEND_CYCLE[0] // custom → substitui pela primeira distância
      : BEND_CYCLE[idx + 1] ?? null;
    applyModel(setBend(mod, cur.measureIndex, cur.beatIndex, string, next));
  }, [applyModel, disabled]);

  // ── Handler de teclado ─────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // Tocar/pausar e ajuda funcionam até no editor desabilitado (só leitura).
      if (e.key === " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        onPlayPause?.();
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen((o) => !o);
        return;
      }
      if (disabled) return;
      const cur = cursorRef.current;
      const mod = modelRef.current;
      const ctrl = e.ctrlKey || e.metaKey;

      // Garante a âncora no cursor atual antes de estender a seleção com Shift.
      const ensureAnchor = () => {
        if (!selAnchorRef.current && cur) {
          setSelAnchor({ measureIndex: cur.measureIndex, beatIndex: cur.beatIndex });
        }
      };

      // ── Atalhos com Ctrl/Cmd ──
      if (ctrl && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case "c": e.preventDefault(); doCopy(false); return;
          case "x": e.preventDefault(); doCopy(true); return;
          case "v": e.preventDefault(); doPaste(); return;
          case "d": e.preventDefault(); doRepeat(); return;
          case "z": e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return;
          case "y": e.preventDefault(); doRedo(); return;
          case ".": {
            e.preventDefault();
            const beat = cur ? mod.measures[cur.measureIndex]?.beats[cur.beatIndex] : null;
            if (beat) applyDots(beatDots(beat) === 2 ? 0 : 2);
            return;
          }
          case "arrowright":
          case "arrowleft": {
            // Navegação por compasso; com Shift, estende a seleção junto.
            e.preventDefault();
            if (!cur) return;
            if (e.shiftKey) ensureAnchor();
            else setSelAnchor(null);
            const dir = e.key === "ArrowRight" ? 1 : -1;
            const mi = Math.max(0, Math.min(mod.measures.length - 1, cur.measureIndex + dir));
            setCursor({ measureIndex: mi, beatIndex: 0, string: cur.string });
            return;
          }
          case "home": {
            e.preventDefault();
            if (!cur) return;
            setSelAnchor(null);
            setCursor({ measureIndex: 0, beatIndex: 0, string: cur.string });
            return;
          }
          case "end": {
            e.preventDefault();
            if (!cur) return;
            setSelAnchor(null);
            const mi = mod.measures.length - 1;
            setCursor({
              measureIndex: mi,
              beatIndex: Math.max(0, (mod.measures[mi]?.beats.length ?? 1) - 1),
              string: cur.string,
            });
            return;
          }
        }
        return; // os demais Ctrl+… ficam com o navegador
      }

      // ── Alt+←/→: move o beat no tempo ──
      if (e.altKey && !ctrl) {
        if (e.key === "ArrowRight") { e.preventDefault(); doMoveBeat(1); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); doMoveBeat(-1); }
        return;
      }

      // Dígito 0–9 define a casa da nota selecionada. Dois dígitos digitados
      // rápido na mesma posição formam uma casa de dois dígitos (1 e 2 = 12),
      // respeitando MAX_FRET; fora da janela, recomeça no dígito novo.
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

      // Letras de efeito (h p t s v m x) e o ciclo de bend (b) — só sem
      // modificadores, para não engolir atalhos do navegador.
      if (!e.altKey && !e.shiftKey) {
        const fx = KEY_EFFECTS[e.key.toLowerCase()];
        if (fx) {
          e.preventDefault();
          handleEffectToggle(fx);
          return;
        }
        if (e.key.toLowerCase() === "b") {
          e.preventDefault();
          cycleBend();
          return;
        }
      }

      switch (e.key) {
        case "ArrowRight": {
          e.preventDefault();
          if (!cur) return;
          if (e.shiftKey) ensureAnchor();
          else setSelAnchor(null);
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
          if (e.shiftKey) ensureAnchor();
          else setSelAnchor(null);
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
          if (e.shiftKey) { doMoveNoteString(-1); return; }
          if (!cur || cur.string <= 1) return;
          setCursor({ ...cur, string: cur.string - 1 });
          break;
        }
        case "ArrowDown": {
          e.preventDefault();
          if (e.shiftKey) { doMoveNoteString(1); return; }
          if (!cur || cur.string >= trackStringCount) return;
          setCursor({ ...cur, string: cur.string + 1 });
          break;
        }
        case "Home": {
          e.preventDefault();
          if (!cur) return;
          setSelAnchor(null);
          setCursor({ ...cur, beatIndex: 0 });
          break;
        }
        case "End": {
          e.preventDefault();
          if (!cur) return;
          setSelAnchor(null);
          const measure = mod.measures[cur.measureIndex];
          setCursor({ ...cur, beatIndex: Math.max(0, (measure?.beats.length ?? 1) - 1) });
          break;
        }
        case ".": {
          e.preventDefault();
          const beat = cur ? mod.measures[cur.measureIndex]?.beats[cur.beatIndex] : null;
          if (beat) applyDots(beatDots(beat) === 1 ? 0 : 1);
          break;
        }
        case "+":
        case "=": {
          e.preventDefault();
          stepDuration(1);
          break;
        }
        case "-": {
          e.preventDefault();
          stepDuration(-1);
          break;
        }
        case "Escape": {
          setSelAnchor(null);
          setBendPopOpen(false);
          setMorePopOpen(false);
          setMeasureMenu(null);
          setTempoPop(null);
          setShortcutsOpen(false);
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
          // Só insere se ainda couber na fórmula de compasso.
          const { num, den } = measureTs(cur.measureIndex);
          const cap = capacity64(num, den);
          const used = measureUsed64(measure);
          const remaining = cap - used;
          if (remaining <= CAP_EPS) {
            // Compasso cheio: para quem pode mexer na estrutura, cria o
            // próximo compasso e o cursor segue para ele — compor do zero é
            // compasso a compasso, e parar num aviso quebrava o fluxo.
            if (canEditStructure && onAddMeasure) {
              pendingCursorRef.current = {
                measureIndex: cur.measureIndex + 1,
                beatIndex: 0,
                string: cur.string,
              };
              onAddMeasure(cur.measureIndex);
            } else {
              showWarn(`Compasso cheio (${num}/${den}) — apague ou encurte um beat antes de inserir.`);
            }
            return;
          }
          // Duração do novo beat: a do beat de referência, se couber; senão a
          // maior figura que ainda cabe.
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
          // Havendo seleção de trecho, apaga o range inteiro.
          const anchor = selAnchorRef.current;
          if (
            anchor &&
            (anchor.measureIndex !== cur.measureIndex || anchor.beatIndex !== cur.beatIndex)
          ) {
            const [start, end] = orderPos(anchor, {
              measureIndex: cur.measureIndex,
              beatIndex: cur.beatIndex,
            });
            const next = deleteRange(mod, start, end);
            applyModel(next);
            setSelAnchor(null);
            setCursor(clampCursor(next, { ...start, string: cur.string }));
            return;
          }
          const beat = mod.measures[cur.measureIndex]?.beats[cur.beatIndex];
          if (!beat) return;
          if (beat.notes.some((n) => n.string === cur.string)) {
            applyModel(deleteNote(mod, cur.measureIndex, cur.beatIndex, cur.string));
          } else if (beat.notes.length === 0) {
            // Só apaga o beat quando ele já é pausa, para não descartar sem
            // querer notas que estejam em outras cordas.
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
    [
      applyDots, applyModel, cycleBend, deleteRange, disabled, doCopy,
      doMoveBeat, doMoveNoteString, doPaste, doRedo, doRepeat, doUndo,
      handleEffectToggle, measureTs, onPlayPause, showWarn, stepDuration,
      trackStringCount, canEditStructure, onAddMeasure,
    ],
  );

  // Beat selecionado; efeitos só fazem sentido quando ele tem notas.
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
  const bendAmount: BendAmount =
    !!cursor && !!selectedBeat && selectedHasNotes
      ? noteBendQuarters(
          model,
          cursor.measureIndex,
          cursor.beatIndex,
          targetString(selectedBeat, cursor.string),
        )
      : null;
  // Rótulo do botão de bend: a distância ativa; "B*" = curva importada própria.
  const bendLabel =
    bendAmount === null
      ? "Bend"
      : bendAmount === "custom"
        ? "B*"
        : BEND_CHOICES.find((b) => b.quarters === bendAmount)?.label ?? "B*";
  // O "mais ▾" acende quando algum efeito escondido nele está ativo na seleção.
  const moreActive = EFFECTS_MORE.some((ef) => effects.includes(ef.value));

  // ── Duração exibida na toolbar ─────────────────────────────────────────────
  const displayDuration: BeatDuration = cursor
    ? (model.measures[cursor.measureIndex]?.beats[cursor.beatIndex]?.duration ?? duration)
    : duration;
  const dotState: 0 | 1 | 2 = selectedBeat ? beatDots(selectedBeat) : 0;

  // ── Andamento próprio do compasso do popover, lido do structPrefix ─────────
  // O exporter escreve `\tempo (120 hide)`; à mão, escreve-se `\tempo 120`.
  // Decide se o popover mostra "Remover" (só mudanças no meio da música).
  const popMeasureTempo: number | null = (() => {
    if (!tempoPop) return null;
    const m = measureMeta?.[tempoPop.measureIndex]?.structPrefix?.match(
      /\\tempo\s*\(?\s*(\d+)/i,
    );
    return m ? Number(m[1]) : null;
  })();

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
    // Offset do surface no viewport: os bounds são relativos ao surface.
    const offX = surfaceRef.current?.offsetLeft ?? 0;
    const offY = surfaceRef.current?.offsetTop ?? 0;

    const barVB = bb.barBounds.visualBounds;
    setBeatRect({
      x: offX + bb.visualBounds.x - 3,
      y: offY + barVB.y,
      w: bb.visualBounds.w + 6,
      h: barVB.h,
    });

    // Corda selecionada: desenha a caixa na linha correspondente.
    const staffStrings = bar.staff.tuning?.length || trackStringCount;
    const targetModelString = staffStrings + 1 - cursor.string; // alphaTex → modelo alphaTab
    const exact = bb.notes?.find((n) => n.note.string === targetModelString);
    if (exact) {
      const nb = exact.noteHeadBounds;
      setNoteRect({ x: offX + nb.x - 3, y: offY + nb.y - 2, w: nb.w + 6, h: nb.h + 4 });
      return;
    }
    // Sem nota nessa corda: interpola a linha pela geometria do compasso.
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

  // ── Overlay do trecho selecionado (âncora↔cursor) ───────────────────────────
  useEffect(() => {
    if (!apiReady || raw || !cursor || !selAnchor) {
      setSelRects([]);
      return;
    }
    const api = apiRef.current;
    const lookup = api?.boundsLookup;
    const bars = api?.score?.tracks?.[0]?.staves?.[0]?.bars;
    if (!lookup || !bars) {
      setSelRects([]);
      return;
    }
    const offX = surfaceRef.current?.offsetLeft ?? 0;
    const offY = surfaceRef.current?.offsetTop ?? 0;
    const [start, end] = orderPos(selAnchor, {
      measureIndex: cursor.measureIndex,
      beatIndex: cursor.beatIndex,
    });
    const rects: Rect[] = [];
    for (let mi = start.measureIndex; mi <= end.measureIndex; mi++) {
      const nBeats = model.measures[mi]?.beats.length ?? 0;
      const from = mi === start.measureIndex ? start.beatIndex : 0;
      const to = mi === end.measureIndex ? end.beatIndex : nBeats - 1;
      for (let bi = from; bi <= to; bi++) {
        const beat = bars[mi]?.voices?.[0]?.beats?.[bi];
        const bb = beat ? lookup.findBeat(beat) : null;
        if (!bb) continue;
        const barVB = bb.barBounds.visualBounds;
        rects.push({
          x: offX + bb.visualBounds.x - 2,
          y: offY + barVB.y,
          w: bb.visualBounds.w + 4,
          h: barVB.h,
        });
      }
    }
    setSelRects(rects);
  }, [cursor, selAnchor, apiReady, raw, renderEpoch, model]);

  // ── Badges de compasso incompleto ou estourado ──────────────────────────────
  // O editor bloqueia estourar, mas um compasso pode ficar menor que a fórmula
  // durante a edição, ou já chegar estourado de um import ou do modo texto.
  // Cada caso é marcado na própria tablatura: "falta 1/4" / "passa 1/8".
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
      // Pausa inteira única = compasso vazio convencional; vale a fórmula toda.
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
      // Fração exibida: arredondada ao 64avo mais próximo; resíduo de quiáltera
      // vira "≈", e diferença menor que meio 64avo não é exibida.
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

  // ── Letras da afinação à esquerda do 1º compasso (estilo Songsterr) ─────────
  useEffect(() => {
    if (!apiReady || raw) {
      setTuningLabels([]);
      return;
    }
    const tokens = tuningTokensFromHeader(trackHeader);
    const api = apiRef.current;
    const lookup = api?.boundsLookup;
    const firstBeat = api?.score?.tracks?.[0]?.staves?.[0]?.bars?.[0]?.voices?.[0]?.beats?.[0];
    const bb = firstBeat && lookup ? lookup.findBeat(firstBeat) : null;
    if (!tokens || !bb) {
      setTuningLabels([]);
      return;
    }
    const offX = surfaceRef.current?.offsetLeft ?? 0;
    const offY = surfaceRef.current?.offsetTop ?? 0;
    const barVB = (bb as unknown as BeatBoundsLike).barBounds.visualBounds;
    const { topY, spacing } = stringGeometry(
      bb as unknown as BeatBoundsLike,
      tokens.length,
    );
    // Corda 1 (aguda) = token 0 = linha de cima, junto ao início do compasso.
    setTuningLabels(
      tokens.map((t, i) => ({
        x: offX + barVB.x - 24,
        y: offY + topY + i * spacing,
        label: splitTuningToken(t).note,
      })),
    );
  }, [apiReady, raw, renderEpoch, model, trackHeader]);

  // ── Marcas de andamento (♩=N) clicáveis, só para o dono ─────────────────────
  // Um overlay transparente sobre a marca desenhada na partitura, para editar ou
  // remover a mudança de andamento clicando na própria marca.
  useEffect(() => {
    if (!apiReady || raw || !canEditStructure) {
      setTempoMarks([]);
      return;
    }
    const api = apiRef.current;
    const lookup = api?.boundsLookup;
    const bars = api?.score?.tracks?.[0]?.staves?.[0]?.bars;
    if (!lookup || !bars) {
      setTempoMarks([]);
      return;
    }
    const offX = surfaceRef.current?.offsetLeft ?? 0;
    const offY = surfaceRef.current?.offsetTop ?? 0;
    const marks: { x: number; y: number; measureIndex: number; bpm: number | null }[] = [];
    const visibleTempo = (prefix: string | null | undefined): number | null => {
      const m = prefix?.match(/\\tempo\s*(\(?)\s*(\d+)([^\n]*)/i);
      if (!m) return null;
      if (m[1] && /\bhide\b/i.test(m[3] ?? "")) return null; // \tempo (N hide)
      return Number(m[2]);
    };
    model.measures.forEach((_, i) => {
      let bpm = visibleTempo(measureMeta?.[i]?.structPrefix);
      // Compasso 1 sem `\tempo` próprio: a marca vem do andamento inicial.
      if (bpm === null && i === 0 && initialTempo && !/\\tempo\b/i.test(measureMeta?.[0]?.structPrefix ?? "")) {
        bpm = initialTempo;
      }
      // Música ainda sem andamento nenhum: marca-fantasma "♩ = ?" no compasso 1
      // — a marca na partitura é o ÚNICO controle de andamento, então precisa
      // existir mesmo antes do primeiro valor.
      if (bpm === null && i !== 0) return;
      const beat = bars[i]?.voices?.[0]?.beats?.[0];
      const bb = beat ? lookup.findBeat(beat) : null;
      if (!bb) return;
      const barVB = bb.barBounds.visualBounds;
      marks.push({ x: offX + barVB.x - 2, y: offY + barVB.y - 34, measureIndex: i, bpm });
    });
    setTempoMarks(marks);
  }, [apiReady, raw, canEditStructure, renderEpoch, model, measureMeta, initialTempo]);

  // ── Número de compasso do alphaTab segue canEditStructure ───────────────────
  // ⚠️ canEditStructure pode chegar DEPOIS da montagem (o /api/me é assíncrono):
  // decidir só nas settings iniciais deixava o número do alphaTab por baixo do
  // overlay clicável — os dois visíveis, "11 22 33".
  useEffect(() => {
    const api = apiRef.current;
    const at = atModuleRef.current;
    if (!apiReady || !api || !at) return;
    const key = at.NotationElement.BarNumber;
    const els = api.settings.notation.elements;
    const hidden = els.get(key) === false;
    if (canEditStructure === hidden) return;
    if (canEditStructure) els.set(key, false);
    else els.delete(key);
    api.updateSettings();
    api.render();
  }, [apiReady, canEditStructure]);

  // ── Números de compasso clicáveis (dono) ────────────────────────────────────
  // O número desenhado pelo alphaTab é desligado na montagem (NotationElement.
  // BarNumber) e substituído por este overlay, que abre o menu de ações do
  // compasso — inserir depois, andamento a partir daqui, remover.
  useEffect(() => {
    if (!apiReady || raw || !canEditStructure) {
      setMeasureNums([]);
      return;
    }
    const api = apiRef.current;
    const lookup = api?.boundsLookup;
    const bars = api?.score?.tracks?.[0]?.staves?.[0]?.bars;
    if (!lookup || !bars) {
      setMeasureNums([]);
      return;
    }
    const offX = surfaceRef.current?.offsetLeft ?? 0;
    const offY = surfaceRef.current?.offsetTop ?? 0;
    const nums: { x: number; y: number; measureIndex: number }[] = [];
    model.measures.forEach((_, i) => {
      const beat = bars[i]?.voices?.[0]?.beats?.[0];
      const bb = beat ? lookup.findBeat(beat) : null;
      if (!bb) return;
      const barVB = bb.barBounds.visualBounds;
      nums.push({ x: offX + barVB.x, y: offY + barVB.y - 17, measureIndex: i });
    });
    setMeasureNums(nums);
  }, [apiReady, raw, canEditStructure, renderEpoch, model]);

  // ── Fechar menus/popovers em clique fora ou Esc ─────────────────────────────
  // No documento, não no viewport: o foco pode estar num botão de overlay ou no
  // input do popover, e o Esc tem que fechar de qualquer lugar.
  const anyPopOpen =
    bendPopOpen || morePopOpen || measureMenu !== null || tempoPop !== null || shortcutsOpen;
  useEffect(() => {
    if (!anyPopOpen) return;
    const closeAll = () => {
      setBendPopOpen(false);
      setMorePopOpen(false);
      setMeasureMenu(null);
      setTempoPop(null);
      setShortcutsOpen(false);
    };
    const onDown = (ev: PointerEvent) => {
      const el = ev.target as HTMLElement | null;
      if (el?.closest?.(".te-pop, .te-pop-anchor")) return;
      closeAll();
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") closeAll();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anyPopOpen]);

  // ── Botão "+" ao final de cada compasso ─────────────────────────────────────
  useEffect(() => {
    if (!apiReady || raw || !canEditStructure) {
      setAddSlots([]);
      return;
    }
    const api = apiRef.current;
    const lookup = api?.boundsLookup;
    const bars = api?.score?.tracks?.[0]?.staves?.[0]?.bars;
    if (!lookup || !bars) {
      setAddSlots([]);
      return;
    }
    const offX = surfaceRef.current?.offsetLeft ?? 0;
    const offY = surfaceRef.current?.offsetTop ?? 0;
    const slots: { x: number; y: number; measureIndex: number }[] = [];
    model.measures.forEach((_, i) => {
      const beat = bars[i]?.voices?.[0]?.beats?.[0];
      const bb = beat ? lookup.findBeat(beat) : null;
      if (!bb) return;
      const barVB = bb.barBounds.visualBounds;
      slots.push({
        x: offX + barVB.x + barVB.w - 8,
        y: offY + barVB.y + barVB.h / 2 - 8,
        measureIndex: i,
      });
    });
    setAddSlots(slots);
  }, [apiReady, raw, canEditStructure, renderEpoch, model]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="tab-editor" style={{ position: "relative" }}>

      {/* ── Cabeçalho: label + toggle ── */}
      <div className="tab-editor-header">
        <span className="tab-editor-section-label">
          {raw ? "Tablatura da faixa (texto)" : "Editor visual"}
        </span>
        <div className="tab-editor-header-right">
          <button
            type="button"
            className="tab-editor-raw-toggle"
            onClick={() => setRawMode((m) => !m)}
          >
            {rawMode ? "usar editor visual" : "editar como texto"}
          </button>
        </div>
      </div>

      {/* ── Toolbar — só as ferramentas de ESCREVER; visível no modo visual.
          Posição/avisos moram na barra de status; ações de compasso e andamento
          moram na própria partitura (menu do compasso, marca ♩=N). ── */}
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
            <button
              type="button"
              className={`tab-editor-btn${dotState === 1 ? " active" : ""}`}
              title="Pontuada: +50% da duração (tecla .)"
              onClick={() => applyDots(dotState === 1 ? 0 : 1)}
              disabled={disabled || !cursor || !selectedBeat}
            >
              ·
            </button>
            <button
              type="button"
              className={`tab-editor-btn${dotState === 2 ? " active" : ""}`}
              title="Duplamente pontuada: +75% da duração (Ctrl+.)"
              onClick={() => applyDots(dotState === 2 ? 0 : 2)}
              disabled={disabled || !cursor || !selectedBeat}
            >
              ··
            </button>
          </div>

          <div className="tab-editor-toolbar-sep" />

          <span className="tab-editor-toolbar-label">Efeito</span>
          <div className="tab-editor-toolbar-group">
            {EFFECTS_MAIN.map((ef) => (
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

            {/* Bend em menu: uma distância por vez, 1 botão no lugar de 3. */}
            <span className="te-pop-anchor" style={{ position: "relative" }}>
              <button
                type="button"
                className={`tab-editor-btn${bendAmount !== null ? " effect-active" : ""}`}
                title="Bend — a tecla b cicla ½ → 1 → 1½"
                aria-expanded={bendPopOpen}
                onClick={() => { setMorePopOpen(false); setBendPopOpen((o) => !o); }}
                disabled={disabled || !cursor || !selectedHasNotes}
              >
                {bendLabel} ▾
              </button>
              {bendPopOpen && (
                <div className="tab-editor-menu te-pop">
                  {BEND_CHOICES.map((b) => (
                    <button
                      key={b.quarters}
                      type="button"
                      className={`tab-editor-menu-item${bendAmount === b.quarters ? " on" : ""}`}
                      onClick={() => { setBendPopOpen(false); handleBendSet(b.quarters); }}
                    >
                      {b.title}
                    </button>
                  ))}
                  {bendAmount === "custom" && (
                    <div className="tab-editor-menu-note">
                      Bend importado com curva própria — escolher uma distância
                      substitui a curva.
                    </div>
                  )}
                  {typeof bendAmount === "number" && (
                    <>
                      <div className="tab-editor-menu-sep" />
                      <button
                        type="button"
                        className="tab-editor-menu-item"
                        onClick={() => { setBendPopOpen(false); handleBendSet(bendAmount); }}
                      >
                        Remover o bend
                      </button>
                    </>
                  )}
                </div>
              )}
            </span>

            {/* Efeitos raros no menu "mais ▾" — a toolbar mostra só o frequente. */}
            <span className="te-pop-anchor" style={{ position: "relative" }}>
              <button
                type="button"
                className={`tab-editor-btn${moreActive ? " effect-active" : ""}`}
                title="Mais efeitos (nota morta, harmônico, acento…)"
                aria-expanded={morePopOpen}
                onClick={() => { setBendPopOpen(false); setMorePopOpen((o) => !o); }}
                disabled={disabled || !cursor || !selectedHasNotes}
              >
                mais ▾
              </button>
              {morePopOpen && (
                <div className="tab-editor-menu te-pop">
                  {EFFECTS_MORE.map((ef) => (
                    <button
                      key={ef.value}
                      type="button"
                      className={`tab-editor-menu-item${effects.includes(ef.value) ? " on" : ""}`}
                      title={ef.title}
                      onClick={() => handleEffectToggle(ef.value)}
                    >
                      <strong>{ef.label}</strong>
                      <span className="tab-editor-menu-desc">{ef.title.split(" (")[0]}</span>
                    </button>
                  ))}
                </div>
              )}
            </span>
          </div>

          <div className="tab-editor-toolbar-sep" />

          {/* Trecho como ícones — o caminho principal é Ctrl+C/V/D. */}
          <div className="tab-editor-toolbar-group">
            <button
              type="button"
              className="tab-editor-btn"
              title="Copiar a seleção (Ctrl+C) — selecione com Shift+setas ou Shift+clique"
              onClick={() => doCopy(false)}
              disabled={!cursor}
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
            <button
              type="button"
              className="tab-editor-btn"
              title="Colar no beat selecionado (Ctrl+V)"
              onClick={doPaste}
              disabled={disabled || !cursor}
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" />
              </svg>
            </button>
            <button
              type="button"
              className="tab-editor-btn"
              title="Repetir a seleção logo depois dela mesma (Ctrl+D) — ideal para riffs"
              onClick={doRepeat}
              disabled={disabled || !cursor}
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m17 2 4 4-4 4" />
                <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
                <path d="m7 22-4-4 4-4" />
                <path d="M21 13v1a4 4 0 0 1-4 4H3" />
              </svg>
            </button>
          </div>

          <div style={{ flex: 1 }} />

          <button
            type="button"
            className="tab-editor-btn tab-editor-help-btn te-pop-anchor"
            title="Atalhos de teclado (tecla ?)"
            aria-expanded={shortcutsOpen}
            onClick={() => setShortcutsOpen((o) => !o)}
          >
            ?
          </button>
        </div>
      )}

      {/* ── Viewport do alphaTab: fica sempre no DOM, oculto no modo texto ── */}
      <div
        ref={viewportRef}
        className="tab-editor-viewport"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onMouseDownCapture={(e) => {
          // Posição relativa ao surface, no mesmo espaço dos bounds do alphaTab:
          // é assim que o beatMouseDown descobre qual corda foi clicada.
          const r = surfaceRef.current?.getBoundingClientRect();
          if (r) {
            lastPointerRef.current = {
              x: e.clientX - r.left,
              y: e.clientY - r.top,
              shift: e.shiftKey,
            };
          }
        }}
        aria-label="Editor de tablatura. Clique num número para selecionar e use o teclado para editar."
        style={{ visibility: raw ? "hidden" : "visible" }}
      >
        {!apiReady && !raw && (
          <div className="player-loading">Carregando editor…</div>
        )}
        <div ref={surfaceRef} className="player-surface" />

        {/* Trecho selecionado (âncora↔cursor): um retângulo por beat */}
        {!raw &&
          selRects.map((r, i) => (
            <div
              key={i}
              className="tab-editor-sel-range"
              style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
            />
          ))}

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

        {/* Afinação por corda no início da tablatura (estilo Songsterr) */}
        {!raw &&
          tuningLabels.map((t, i) => (
            <span
              key={i}
              className="tab-editor-tuning-label"
              style={{ left: t.x, top: t.y }}
            >
              {t.label}
            </span>
          ))}

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

        {/* Marcas ♩=N clicáveis — O controle de andamento (não há outro). A
            marca-fantasma "♩ = ?" cobre música que ainda não tem andamento. */}
        {!raw &&
          tempoMarks.map((tm) => (
            <button
              key={tm.measureIndex}
              type="button"
              className={`tab-editor-tempo-mark te-pop-anchor${tm.bpm === null ? " ghost" : ""}`}
              title={
                tm.bpm === null
                  ? "Definir o andamento da música"
                  : `Andamento: ${tm.bpm} bpm a partir do compasso ${tm.measureIndex + 1} — clique para mudar`
              }
              style={{ left: tm.x, top: tm.y }}
              disabled={disabled}
              onClick={() => {
                setMeasureMenu(null);
                setTempoPopVal(tm.bpm !== null ? String(tm.bpm) : "");
                setTempoPop({ measureIndex: tm.measureIndex, x: tm.x, y: tm.y + 24 });
              }}
            >
              {tm.bpm === null ? "♩ = ?" : ""}
            </button>
          ))}

        {/* Números de compasso clicáveis (dono): menu de ações do compasso */}
        {!raw &&
          canEditStructure &&
          measureNums.map((mn) => (
            <button
              key={mn.measureIndex}
              type="button"
              className={`tab-editor-measure-num te-pop-anchor${
                measureMenu?.measureIndex === mn.measureIndex ? " open" : ""
              }`}
              title={`Ações do compasso ${mn.measureIndex + 1}`}
              style={{ left: mn.x, top: mn.y }}
              onClick={() =>
                setMeasureMenu((m) =>
                  m?.measureIndex === mn.measureIndex
                    ? null
                    : { measureIndex: mn.measureIndex, x: mn.x, y: mn.y + 16 },
                )
              }
            >
              {mn.measureIndex + 1}
              <span className="tab-editor-measure-caret">▾</span>
            </button>
          ))}

        {/* Menu de ações do compasso — a ação acontece NO compasso que afeta */}
        {!raw && measureMenu && (
          <div
            className="tab-editor-menu te-pop"
            style={{ position: "absolute", left: measureMenu.x, top: measureMenu.y, zIndex: 30 }}
          >
            <div className="tab-editor-menu-title">compasso {measureMenu.measureIndex + 1}</div>
            <button
              type="button"
              className="tab-editor-menu-item"
              disabled={disabled}
              onClick={() => {
                const mi = measureMenu.measureIndex;
                setMeasureMenu(null);
                onAddMeasure?.(mi);
              }}
            >
              Inserir compasso depois
            </button>
            <button
              type="button"
              className="tab-editor-menu-item"
              disabled={disabled}
              onClick={() => {
                const mi = measureMenu.measureIndex;
                const m = measureMeta?.[mi]?.structPrefix?.match(/\\tempo\s*\(?\s*(\d+)/i);
                const own = m ? Number(m[1]) : mi === 0 ? initialTempo ?? null : null;
                setTempoPopVal(own !== null ? String(own) : "");
                setTempoPop({ measureIndex: mi, x: measureMenu.x, y: measureMenu.y });
                setMeasureMenu(null);
              }}
            >
              Andamento a partir daqui…
            </button>
            <div className="tab-editor-menu-sep" />
            <button
              type="button"
              className="tab-editor-menu-item danger"
              disabled={disabled}
              onClick={() => {
                const mi = measureMenu.measureIndex;
                setMeasureMenu(null);
                onDeleteMeasure?.(mi);
              }}
            >
              Remover este compasso…
            </button>
          </div>
        )}

        {/* Popover de andamento, ancorado na marca ♩=N ou no menu do compasso */}
        {!raw && tempoPop && (
          <div
            className="tab-editor-tempo-pop te-pop"
            style={{ position: "absolute", left: tempoPop.x, top: tempoPop.y, zIndex: 30 }}
          >
            <span className="tab-editor-tempo-pop-label">
              {tempoPop.measureIndex === 0
                ? "andamento inicial da música"
                : `a partir do compasso ${tempoPop.measureIndex + 1}`}
            </span>
            <div className="tab-editor-tempo-pop-row">
              <span className="tempo-ctl">
                ♩=
                <input
                  type="number"
                  className="tempo-input"
                  min={20}
                  max={400}
                  value={tempoPopVal}
                  placeholder="120"
                  autoFocus
                  onChange={(e) => setTempoPopVal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && tempoPopVal.trim()) {
                      const mi = tempoPop.measureIndex;
                      setTempoPop(null);
                      onSetMeasureTempo?.(mi, Number(tempoPopVal));
                    }
                    if (e.key === "Escape") setTempoPop(null);
                  }}
                  aria-label="Andamento (bpm)"
                />
                bpm
              </span>
              <button
                type="button"
                className="tab-editor-btn"
                disabled={!tempoPopVal.trim()}
                onClick={() => {
                  const mi = tempoPop.measureIndex;
                  setTempoPop(null);
                  onSetMeasureTempo?.(mi, Number(tempoPopVal));
                }}
              >
                Aplicar
              </button>
              {popMeasureTempo !== null && tempoPop.measureIndex > 0 && (
                <button
                  type="button"
                  className="tab-editor-btn"
                  title="Remover a mudança de andamento deste compasso"
                  onClick={() => {
                    const mi = tempoPop.measureIndex;
                    setTempoPop(null);
                    onSetMeasureTempo?.(mi, null);
                  }}
                >
                  Remover
                </button>
              )}
            </div>
          </div>
        )}

        {/* Botão "+" ao final de cada compasso — inserir um vazio logo depois */}
        {!raw &&
          canEditStructure &&
          addSlots.map((s) => (
            <button
              key={s.measureIndex}
              type="button"
              className="tab-editor-inline-add"
              title={`Inserir um compasso depois do ${s.measureIndex + 1}`}
              style={{ left: s.x, top: s.y }}
              disabled={disabled}
              onClick={() => onAddMeasure?.(s.measureIndex)}
            >
              +
            </button>
          ))}
      </div>

      {/* ── Barra de status: onde estou + fórmula + avisos, como em qualquer
          editor profissional. A toolbar fica só com ferramentas. ── */}
      {!raw && (
        <div className="tab-editor-statusbar">
          {cursor ? (
            <span className="tab-editor-pos">
              Comp. <strong>{cursor.measureIndex + 1}</strong>
              {" · "}Beat <strong>{cursor.beatIndex + 1}</strong>
              {" · "}corda <strong>{stringName(cursor.string, trackStringCount)}</strong>
              {" · "}
              <strong title={DURATIONS.find((d) => d.value === displayDuration)?.title}>
                1/{displayDuration}
                {dotState === 1 ? "·" : dotState === 2 ? "··" : ""}
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
            <span className="tab-editor-pos">
              Clique numa nota da tablatura para selecionar
            </span>
          )}

          {warn && <span className="tab-editor-chip warn">{warn}</span>}
          {!warn && flash && <span className="tab-editor-chip info">{flash}</span>}
          {error && <span className="form-error tab-editor-status-msg">{error}</span>}
          {info && !error && <span className="form-ok tab-editor-status-msg">{info}</span>}

          <span style={{ flex: 1 }} />

          <button
            type="button"
            className="tab-editor-status-help te-pop-anchor"
            onClick={() => setShortcutsOpen((o) => !o)}
          >
            <kbd className="tab-editor-key">?</kbd> atalhos
          </button>
        </div>
      )}

      {/* ── Painel de atalhos (tecla ?) — os "tutoriais" moram aqui agora ── */}
      {!raw && shortcutsOpen && (
        <div className="tab-editor-shortcuts te-pop" role="dialog" aria-label="Atalhos de teclado">
          <div className="tab-editor-shortcuts-head">
            <strong>Atalhos — a mão não sai do teclado</strong>
            <button
              type="button"
              className="tab-editor-raw-toggle"
              onClick={() => setShortcutsOpen(false)}
            >
              fechar (Esc)
            </button>
          </div>
          <div className="tab-editor-sc-grid">
            <div>
              <div className="tab-editor-sc-title">escrever</div>
              <div className="tab-editor-sc-row"><span>casa (2 dígitos rápidos = 10+)</span><span><kbd className="tab-editor-key">0–9</kbd></span></div>
              <div className="tab-editor-sc-row"><span>pausa</span><span><kbd className="tab-editor-key">r</kbd></span></div>
              <div className="tab-editor-sc-row"><span>inserir beat (cheio: cria compasso)</span><span><kbd className="tab-editor-key">i</kbd></span></div>
              <div className="tab-editor-sc-row"><span>apagar nota/beat/seleção</span><span><kbd className="tab-editor-key">Del</kbd></span></div>
              <div className="tab-editor-sc-row"><span>duração: subdividir / alongar</span><span><kbd className="tab-editor-key">+</kbd> <kbd className="tab-editor-key">−</kbd></span></div>
              <div className="tab-editor-sc-row"><span>pontuado / duplo pontuado</span><span><kbd className="tab-editor-key">.</kbd> <kbd className="tab-editor-key">Ctrl+.</kbd></span></div>
            </div>
            <div>
              <div className="tab-editor-sc-title">efeitos</div>
              <div className="tab-editor-sc-row"><span>hammer-on / pull-off</span><span><kbd className="tab-editor-key">h</kbd> <kbd className="tab-editor-key">p</kbd></span></div>
              <div className="tab-editor-sc-row"><span>ligadura / slide</span><span><kbd className="tab-editor-key">t</kbd> <kbd className="tab-editor-key">s</kbd></span></div>
              <div className="tab-editor-sc-row"><span>vibrato / palm mute</span><span><kbd className="tab-editor-key">v</kbd> <kbd className="tab-editor-key">m</kbd></span></div>
              <div className="tab-editor-sc-row"><span>nota morta</span><span><kbd className="tab-editor-key">x</kbd></span></div>
              <div className="tab-editor-sc-row"><span>bend (cicla ½ → 1 → 1½)</span><span><kbd className="tab-editor-key">b</kbd></span></div>
            </div>
            <div>
              <div className="tab-editor-sc-title">navegar</div>
              <div className="tab-editor-sc-row"><span>beat / corda</span><span><kbd className="tab-editor-key">← →</kbd> <kbd className="tab-editor-key">↑ ↓</kbd></span></div>
              <div className="tab-editor-sc-row"><span>por compasso</span><span><kbd className="tab-editor-key">Ctrl+← →</kbd></span></div>
              <div className="tab-editor-sc-row"><span>início / fim da música</span><span><kbd className="tab-editor-key">Ctrl+Home/End</kbd></span></div>
              <div className="tab-editor-sc-row"><span>tocar / pausar</span><span><kbd className="tab-editor-key">Espaço</kbd></span></div>
              <div className="tab-editor-sc-row"><span>selecionar trecho</span><span><kbd className="tab-editor-key">Shift+← →</kbd></span></div>
              <div className="tab-editor-sc-row"><span>este painel</span><span><kbd className="tab-editor-key">?</kbd></span></div>
            </div>
            <div>
              <div className="tab-editor-sc-title">trecho</div>
              <div className="tab-editor-sc-row"><span>copiar / recortar / colar</span><span><kbd className="tab-editor-key">Ctrl+C/X/V</kbd></span></div>
              <div className="tab-editor-sc-row"><span>repetir a seleção adiante</span><span><kbd className="tab-editor-key">Ctrl+D</kbd></span></div>
              <div className="tab-editor-sc-row"><span>mover beat no tempo</span><span><kbd className="tab-editor-key">Alt+← →</kbd></span></div>
              <div className="tab-editor-sc-row"><span>mover nota de corda</span><span><kbd className="tab-editor-key">Shift+↑ ↓</kbd></span></div>
              <div className="tab-editor-sc-row"><span>desfazer / refazer</span><span><kbd className="tab-editor-key">Ctrl+Z/Y</kbd></span></div>
            </div>
          </div>
        </div>
      )}

      {/* ── Overlay do modo texto, sobre o editor visual ── */}
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
