"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DRUM_PIECES,
  DEFAULT_LANES,
  PIECE_BY_MIDI,
  RESOLUTIONS,
  type DrumResolution,
  type Bar,
  type NoteMod,
  resolutionFits,
  canTriplet,
  emptyBar,
  parseBar,
  serializeBar,
  remapBeat,
  remapBeatIsLossless,
  cloneBar,
  conformBar,
  midisInBars,
} from "@/lib/drum-grid";
import type { MeasureMeta, TabEditorHandle } from "@/components/TabEditor";

type Props = {
  alphaTex: string;
  onChange: (tex: string) => void;
  disabled?: boolean;
  measureMeta?: MeasureMeta[];
  canEditStructure?: boolean;
  onAddMeasure?: (afterMeasureIndex: number) => void;
  onDeleteMeasure?: (measureIndex: number) => void;
  error?: string | null;
  info?: string | null;
};

type Brush = "note" | "accent" | "ghost" | "flam";
const BRUSHES: { key: Brush; label: string; hint: string }[] = [
  { key: "note", label: "Nota", hint: "Colocar/tirar um golpe" },
  { key: "accent", label: "› Acento", hint: "Golpe forte (acento)" },
  { key: "ghost", label: "( ) Fantasma", hint: "Golpe fraco (nota fantasma)" },
  { key: "flam", label: "⌐ Flam", hint: "Ornamento (nota de graça antes)" },
];

const BAR_SEP = "\n|\n";

// Semínima do alphaTab = 960 ticks → semibreve = 3840 (o mesmo TPW da grade).
const TICKS_PER_WHOLE = 3840;

// Clipboard de compassos em escopo de MÓDULO (convenção do TabEditor):
// sobrevive à troca de trilha/música na sessão — dá para copiar o groove de
// uma bateria e colar em outra.
let drumClipboard: Bar[] | null = null;

// Texto original de cada compasso + se a grade o tocou. Compasso NÃO tocado
// re-emite o texto original intacto: sem isso, um clique numa célula
// re-serializava a trilha inteira na notação da grade e TODO compasso contava
// como "mudado" no save (o bug dos "103 compassos", agora na bateria).
type BarOrigin = { text: string; touched: boolean };

// Undo/redo: fotos de (bars + origins + resolução). Guardar referências é
// barato — as mutações clonam só o beat tocado (convenção do TabEditor).
type Snapshot = { bars: Bar[]; origs: BarOrigin[]; res: DrumResolution };

function parseAll(
  tex: string,
  res: DrumResolution,
  meta: MeasureMeta[] | undefined,
): { bars: Bar[]; raws: string[]; anyFail: boolean } | null {
  const rawBars = tex.split("|").map((s) => s.trim());
  if (meta && meta.length && rawBars.length !== meta.length) return null;
  const bars: Bar[] = [];
  let anyFail = false;
  for (let i = 0; i < rawBars.length; i++) {
    const tsNum = meta?.[i]?.tsNum ?? 4;
    const tsDen = meta?.[i]?.tsDen ?? 4;
    if (!resolutionFits(tsNum, tsDen, res)) return null;
    const g = parseBar(rawBars[i], tsNum, tsDen, res);
    if (!g.parseOk) anyFail = true;
    bars.push(g.parseOk ? g : emptyBar(tsNum, res, tsDen));
  }
  return { bars, raws: rawBars, anyFail };
}

/** Guia rápido da notação de percussão (modo texto). */
function PercGuide() {
  return (
    <details className="perc-guide">
      <summary>Como escrever bateria/percussão</summary>
      <div className="perc-guide-body">
        <p>
          Duração antes das notas (<code>:4</code> semínima, <code>:8</code>{" "}
          colcheia, <code>:16</code> semicolcheia). Notas tocadas juntas vão
          entre parênteses. Pausa = <code>r</code>. Compassos separados por{" "}
          <code>|</code>.
        </p>
        <div className="perc-guide-cols">
          {[
            ["Bumbo", "36"],
            ["Caixa", "38"],
            ["Caixa (aro)", "37"],
            ["Chimbal fechado", "42"],
            ["Chimbal aberto", "46"],
            ["Chimbal c/ pedal", "44"],
            ["Prato de ataque", "49"],
            ["Prato de condução", "51"],
            ["Tom agudo", "48"],
            ["Tom médio", "45"],
            ["Surdo/tom grave", "43"],
            ["Caixa elétrica", "40"],
          ].map(([label, code]) => (
            <span key={code} className="perc-piece">
              <code>{code}</code> {label}
            </span>
          ))}
        </div>
        <p className="perc-guide-ex">
          Groove de rock (1 compasso):{" "}
          <code>:8 (36 42) 42 (38 42) 42 (36 42) 42 (38 42) 42</code>
        </p>
      </div>
    </details>
  );
}

const DrumGridEditor = forwardRef<TabEditorHandle, Props>(function DrumGridEditor(
  {
    alphaTex,
    onChange,
    disabled = false,
    measureMeta,
    canEditStructure = false,
    onAddMeasure,
    onDeleteMeasure,
    error,
    info,
  },
  ref,
) {
  const [res, setRes] = useState<DrumResolution>(16);
  const [bars, setBars] = useState<Bar[]>([]);
  const [lanes, setLanes] = useState<number[]>(DEFAULT_LANES);
  const [brush, setBrush] = useState<Brush>("note");
  const [textMode, setTextMode] = useState(false);
  const [warn, setWarn] = useState<string | null>(null);
  const [addLaneOpen, setAddLaneOpen] = useState(false);
  // Menu "preencher a cada N" (botão direito no nome da peça) — midi da linha.
  const [laneMenu, setLaneMenu] = useState<number | null>(null);
  // Seleção de compassos (âncora↔cabeça, clique/Shift+clique no cabeçalho).
  const [sel, setSel] = useState<{ anchor: number; head: number } | null>(null);
  // Posição de playback (célula da coluna do cursor) — vinda do player headless.
  const [playPos, setPlayPos] = useState<
    { bar: number; beat: number; cell: number } | null
  >(null);
  const lastEmittedRef = useRef<string | null>(null);
  const origsRef = useRef<BarOrigin[]>([]);
  // Pilhas de undo/redo, zeradas em mudança externa (convenção do TabEditor).
  const histRef = useRef<{ past: Snapshot[]; future: Snapshot[] }>({
    past: [],
    future: [],
  });
  // Arrasto de pintura em curso: peça (linha) + estado alvo decidido na 1ª célula
  // (célula tinha nota → arrasto apaga; vazia → pinta), convenção FL Studio.
  const dragRef = useRef<{ midi: number; brush: Brush; add: boolean } | null>(null);
  // Refs sempre atuais para handlers registrados uma vez (seekTick, pointerup).
  const barsRef = useRef<Bar[]>([]);
  const resRef = useRef(res);
  resRef.current = res;
  const measureMetaRef = useRef(measureMeta);
  measureMetaRef.current = measureMeta;

  const applyBars = useCallback((next: Bar[]) => {
    barsRef.current = next;
    setBars(next);
  }, []);

  const tsDenOf = useCallback(
    (i: number) => measureMeta?.[i]?.tsDen ?? 4,
    [measureMeta],
  );
  const tsNumOf = useCallback(
    (i: number) => measureMeta?.[i]?.tsNum ?? 4,
    [measureMeta],
  );

  const validResolutions = useMemo(
    () =>
      RESOLUTIONS.filter((r) =>
        (measureMeta ?? [{ tsNum: 4, tsDen: 4, structPrefix: null }]).every((m) =>
          resolutionFits(m.tsNum, m.tsDen, r.value),
        ),
      ),
    [measureMeta],
  );

  // ── Cursor de reprodução ────────────────────────────────────────────────────
  // Mesma interface do TabEditor: o TrackEditor encaminha o tick do player
  // headless; aqui o tick vira (compasso, tempo, célula) pela fórmula de
  // compasso — a coluna acesa acompanha a música.
  useImperativeHandle(ref, () => ({
    seekTick: (tick: number) => {
      const curBars = barsRef.current;
      const meta = measureMetaRef.current;
      let t = tick;
      let bi = 0;
      while (bi < curBars.length) {
        const tsNum = meta?.[bi]?.tsNum ?? 4;
        const tsDen = meta?.[bi]?.tsDen ?? 4;
        const barTicks = tsNum * (TICKS_PER_WHOLE / tsDen);
        if (t < barTicks) break;
        t -= barTicks;
        bi++;
      }
      const bar = curBars[bi];
      if (!bar || bar.beats.length === 0) {
        setPlayPos(null);
        return;
      }
      const beatTicks = TICKS_PER_WHOLE / (meta?.[bi]?.tsDen ?? 4);
      const bj = Math.min(Math.floor(t / beatTicks), bar.beats.length - 1);
      const nCells = bar.beats[bj].cells.length;
      const ci = Math.min(
        Math.floor(((t - bj * beatTicks) / beatTicks) * nCells),
        nCells - 1,
      );
      setPlayPos((prev) =>
        prev && prev.bar === bi && prev.beat === bj && prev.cell === ci
          ? prev
          : { bar: bi, beat: bj, cell: ci },
      );
    },
  }), []);

  // (Re)parse when the external text changes (not our own emit).
  useEffect(() => {
    if (alphaTex === lastEmittedRef.current) return;
    const parsed = parseAll(alphaTex, res, measureMeta);
    // O texto externo é a nova BASE: cada compasso guarda seu texto original e
    // só re-serializa depois de ser tocado na grade.
    origsRef.current = (parsed?.raws ?? []).map((text) => ({
      text,
      touched: false,
    }));
    histRef.current = { past: [], future: [] };
    setSel(null);
    if (!parsed || parsed.anyFail) {
      setTextMode(true);
      setWarn(
        parsed
          ? "Alguns compassos têm notação que a grade não modela (vozes paralelas/quiálteras irregulares) — editando como texto."
          : "Este conteúdo não encaixa na grade — editando como texto.",
      );
      if (parsed) applyBars(parsed.bars);
      return;
    }
    applyBars(parsed.bars);
    const present = midisInBars(parsed.bars);
    setLanes((prev) => {
      const set = new Set([...DEFAULT_LANES, ...prev, ...present]);
      return DRUM_PIECES.map((p) => p.midi).filter((m) => set.has(m));
    });
    setWarn(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alphaTex, measureMeta]);

  // Compassos não tocados re-emitem o texto original; tocados, a grade.
  const buildTex = useCallback((next: Bar[], r: DrumResolution) => {
    const origs = origsRef.current;
    return next
      .map((b, i) => {
        const o = origs[i];
        return o && !o.touched ? o.text : serializeBar(b, r);
      })
      .join(BAR_SEP);
  }, []);

  const emit = useCallback(
    (next: Bar[], r: DrumResolution) => {
      const tex = buildTex(next, r);
      lastEmittedRef.current = tex;
      onChange(tex);
    },
    [onChange, buildTex],
  );

  const markTouched = (barIdx: number) => {
    const o = origsRef.current[barIdx];
    if (o) o.touched = true;
  };

  // ── Undo/redo ───────────────────────────────────────────────────────────────
  const takeSnapshot = (): Snapshot => ({
    bars: barsRef.current,
    origs: origsRef.current.map((o) => ({ ...o })),
    res: resRef.current,
  });
  const pushHistory = () => {
    histRef.current.past.push(takeSnapshot());
    histRef.current.future = [];
  };
  const restoreSnapshot = (s: Snapshot) => {
    origsRef.current = s.origs.map((o) => ({ ...o }));
    setRes(s.res);
    resRef.current = s.res;
    applyBars(s.bars);
    emit(s.bars, s.res);
  };
  const undo = () => {
    const s = histRef.current.past.pop();
    if (!s) return;
    histRef.current.future.push(takeSnapshot());
    restoreSnapshot(s);
  };
  const redo = () => {
    const s = histRef.current.future.pop();
    if (!s) return;
    histRef.current.past.push(takeSnapshot());
    restoreSnapshot(s);
  };

  // ── Pintura (célula) ────────────────────────────────────────────────────────
  // Clona só o compasso/beat tocado (imutável para o React); lê barsRef (não o
  // state) para não perder pinceladas num arrasto rápido entre re-renders.
  function applyCellChange(
    barIdx: number,
    beatIdx: number,
    fn: (cells: Map<number, NoteMod>[]) => void,
  ) {
    const cur = barsRef.current;
    const next = cur.map((bar, bi) =>
      bi !== barIdx
        ? bar
        : {
            ...bar,
            beats: bar.beats.map((beat, bj) =>
              bj !== beatIdx
                ? beat
                : { ...beat, cells: beat.cells.map((c) => new Map(c)) },
            ),
          },
    );
    fn(next[barIdx].beats[beatIdx].cells);
    markTouched(barIdx);
    applyBars(next);
    emit(next, resRef.current);
  }

  /** Leva a célula ao estado-alvo `add` do pincel (idempotente — seguro num
   *  arrasto que repassa pela mesma célula). */
  function paintCell(
    barIdx: number,
    beatIdx: number,
    cellIdx: number,
    midi: number,
    b: Brush,
    add: boolean,
  ) {
    applyCellChange(barIdx, beatIdx, (cells) => {
      const cell = cells[cellIdx];
      const cur = cell.get(midi);
      if (b === "note") {
        if (add) {
          if (!cur) cell.set(midi, {});
        } else {
          cell.delete(midi);
        }
        return;
      }
      const mod: NoteMod = { ...(cur ?? {}) };
      if (b === "accent") {
        mod.accent = add;
        if (add) mod.ghost = false;
      } else if (b === "ghost") {
        mod.ghost = add;
        if (add) mod.accent = false;
      } else if (b === "flam") {
        mod.flam = add;
      }
      if (!cur && !add) return; // tirar modificador de célula vazia = nada
      cell.set(midi, mod);
    });
  }

  function startPaint(
    e: React.PointerEvent,
    barIdx: number,
    beatIdx: number,
    cellIdx: number,
    midi: number,
  ) {
    if (disabled) return;
    if (e.button !== 0 && e.button !== 2) return;
    const cur = barsRef.current[barIdx]?.beats[beatIdx]?.cells[cellIdx]?.get(midi);
    // Botão direito = apagar o golpe (FL Studio), qualquer que seja o pincel.
    const b: Brush = e.button === 2 ? "note" : brush;
    const add =
      e.button === 2
        ? false
        : b === "note"
          ? !cur
          : b === "accent"
            ? !cur?.accent
            : b === "ghost"
              ? !cur?.ghost
              : !cur?.flam;
    pushHistory();
    dragRef.current = { midi, brush: b, add };
    paintCell(barIdx, beatIdx, cellIdx, midi, b, add);
  }

  function dragOver(barIdx: number, beatIdx: number, cellIdx: number, midi: number) {
    const d = dragRef.current;
    if (!d || d.midi !== midi) return; // pintura corre pela MESMA linha (peça)
    paintCell(barIdx, beatIdx, cellIdx, midi, d.brush, d.add);
  }

  // Fim do arrasto: solta em qualquer lugar da janela.
  useEffect(() => {
    const up = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  // ── Preencher a cada N (botão direito no nome da peça) ──────────────────────
  function fillLane(midi: number, mode: "beat" | "half" | "cell" | "clear") {
    pushHistory();
    const next = barsRef.current.map((bar, bi) => {
      let changed = false;
      const beats = bar.beats.map((beat) => {
        const n = beat.cells.length;
        const cells = beat.cells.map((c) => new Map(c));
        for (let i = 0; i < n; i++) {
          if (mode === "clear") {
            if (cells[i].delete(midi)) changed = true;
            continue;
          }
          const want =
            mode === "cell" ||
            (mode === "beat" && i === 0) ||
            (mode === "half" && n % 2 === 0 && i % (n / 2) === 0);
          if (want && !cells[i].has(midi)) {
            cells[i].set(midi, {});
            changed = true;
          }
        }
        return { ...beat, cells };
      });
      if (!changed) return bar;
      markTouched(bi);
      return { ...bar, beats };
    });
    applyBars(next);
    emit(next, resRef.current);
    setLaneMenu(null);
  }

  // ── Seleção de compassos + clipboard ────────────────────────────────────────
  const selRange = sel
    ? { from: Math.min(sel.anchor, sel.head), to: Math.max(sel.anchor, sel.head) }
    : null;
  const inSel = (bi: number) =>
    selRange !== null && bi >= selRange.from && bi <= selRange.to;

  function selectBar(bi: number, extend: boolean) {
    setSel((prev) =>
      extend && prev ? { anchor: prev.anchor, head: bi } : { anchor: bi, head: bi },
    );
  }

  function copySel() {
    if (!selRange) return;
    drumClipboard = [];
    for (let i = selRange.from; i <= selRange.to; i++) {
      drumClipboard.push(cloneBar(barsRef.current[i]));
    }
    setWarn(null);
  }

  function clearSel() {
    if (!selRange || disabled) return;
    pushHistory();
    const next = barsRef.current.map((bar, bi) => {
      if (!inSel(bi)) return bar;
      markTouched(bi);
      // Zera os golpes mas preserva as diretivas opacas do compasso.
      return { ...emptyBar(tsNumOf(bi), resRef.current, tsDenOf(bi)), prefix: bar.prefix };
    });
    applyBars(next);
    emit(next, resRef.current);
  }

  /** Cola `src` a partir do compasso `at`, conformando cada um à fórmula do
   *  destino; devolve quantos couberam. Preserva o prefixo do DESTINO. */
  function pasteBarsAt(src: Bar[], at: number): number {
    const cur = barsRef.current;
    const n = Math.min(src.length, cur.length - at);
    if (n <= 0) return 0;
    pushHistory();
    const next = cur.map((bar, bi) => {
      const k = bi - at;
      if (k < 0 || k >= n) return bar;
      markTouched(bi);
      const conformed = conformBar(src[k], tsNumOf(bi), tsDenOf(bi), resRef.current);
      return { ...conformed, prefix: bar.prefix };
    });
    applyBars(next);
    emit(next, resRef.current);
    return n;
  }

  function pasteSel() {
    if (disabled) return;
    if (!drumClipboard || drumClipboard.length === 0) {
      setWarn("Nada copiado ainda — selecione compassos e Ctrl+C.");
      return;
    }
    if (!selRange) {
      setWarn("Clique num “compasso N” para escolher onde colar.");
      return;
    }
    const n = pasteBarsAt(drumClipboard, selRange.from);
    if (n < drumClipboard.length) {
      setWarn(`Colei ${n} de ${drumClipboard.length} — acabaram os compassos.`);
    } else {
      setWarn(null);
    }
    if (n > 0) setSel({ anchor: selRange.from, head: selRange.from + n - 1 });
  }

  /** Ctrl+D (convenção TabEditor/MuseScore): repete a seleção logo adiante e
   *  move a seleção para a cópia — apertar de novo continua preenchendo. */
  function duplicateSel() {
    if (!selRange || disabled) return;
    const src: Bar[] = [];
    for (let i = selRange.from; i <= selRange.to; i++) {
      src.push(cloneBar(barsRef.current[i]));
    }
    const at = selRange.to + 1;
    const n = pasteBarsAt(src, at);
    if (n === 0) {
      setWarn("Sem compassos depois da seleção — adicione compassos primeiro.");
      return;
    }
    setWarn(n < src.length ? `Repeti ${n} de ${src.length} — acabaram os compassos.` : null);
    setSel({ anchor: at, head: at + n - 1 });
  }

  // ── Atalhos de teclado (grade) ──────────────────────────────────────────────
  useEffect(() => {
    if (textMode) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (e.key === "Escape") {
        setSel(null);
        setLaneMenu(null);
        setAddLaneOpen(false);
        return;
      }
      if (disabled) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && (e.key === "c" || e.key === "C")) {
        if (!selRange) return;
        e.preventDefault();
        copySel();
        return;
      }
      if (mod && (e.key === "x" || e.key === "X")) {
        if (!selRange) return;
        e.preventDefault();
        copySel();
        clearSel();
        return;
      }
      if (mod && (e.key === "v" || e.key === "V")) {
        e.preventDefault();
        pasteSel();
        return;
      }
      if (mod && (e.key === "d" || e.key === "D")) {
        if (!selRange) return;
        e.preventDefault();
        duplicateSel();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selRange) {
        e.preventDefault();
        clearSel();
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function toggleTriplet(barIdx: number, beatIdx: number) {
    if (disabled) return;
    const tsDen = tsDenOf(barIdx);
    if (!canTriplet(res, tsDen)) {
      setWarn("Quiáltera precisa de resolução 1/8 ou menor.");
      return;
    }
    pushHistory();
    const next = barsRef.current.map((bar, bi) =>
      bi !== barIdx
        ? bar
        : {
            ...bar,
            beats: bar.beats.map((beat, bj) =>
              bj !== beatIdx ? beat : remapBeat(beat, !beat.triplet, res, tsDen),
            ),
          },
    );
    markTouched(barIdx);
    applyBars(next);
    emit(next, res);
  }

  function changeRes(r: DrumResolution) {
    // Golpe que não cai exato na nova subdivisão vai se mover (destrutivo) —
    // avisar antes. Só os compassos de fato alterados contam como tocados.
    const cur = barsRef.current;
    const lossyBars = cur.map((bar, bi) => {
      const tsDen = tsDenOf(bi);
      return bar.beats.some(
        (beat) =>
          !remapBeatIsLossless(beat, beat.triplet && canTriplet(r, tsDen), r, tsDen),
      );
    });
    if (
      lossyBars.some(Boolean) &&
      !window.confirm(
        "Alguns golpes não caem exatamente na nova resolução e serão movidos. Continuar?",
      )
    ) {
      return;
    }
    pushHistory();
    const next = cur.map((bar, bi) => {
      const tsDen = tsDenOf(bi);
      return {
        ...bar,
        beats: bar.beats.map((beat) =>
          remapBeat(beat, beat.triplet && canTriplet(r, tsDen), r, tsDen),
        ),
      };
    });
    lossyBars.forEach((lossy, i) => {
      if (lossy) markTouched(i);
    });
    applyBars(next);
    setRes(r);
    resRef.current = r;
    emit(next, r);
  }

  const hiddenPieces = DRUM_PIECES.filter((p) => !lanes.includes(p.midi));
  function addLane(midi: number) {
    setLanes((prev) =>
      DRUM_PIECES.map((p) => p.midi).filter((m) => prev.includes(m) || m === midi),
    );
    setAddLaneOpen(false);
  }
  function removeLane(midi: number) {
    const used = bars.some((b) =>
      b.beats.some((beat) => beat.cells.some((c) => c.has(midi))),
    );
    if (used) return;
    setLanes((prev) => prev.filter((m) => m !== midi));
  }

  function reparseIntoGrid() {
    const parsed = parseAll(alphaTex, res, measureMeta);
    if (!parsed) {
      setWarn("Ainda não encaixa na grade — corrija o texto primeiro.");
      return;
    }
    origsRef.current = parsed.raws.map((text) => ({ text, touched: false }));
    histRef.current = { past: [], future: [] };
    setSel(null);
    applyBars(parsed.bars);
    setWarn(parsed.anyFail ? "Alguns compassos ficaram vazios na grade." : null);
    setTextMode(false);
  }

  // ── Modo texto (fallback / escape hatch) ──
  if (textMode) {
    return (
      <div className="drum-editor">
        <div className="drum-toolbar">
          <span className="drum-toolbar-label">Bateria — texto</span>
          <button type="button" className="drum-mode-toggle" onClick={reparseIntoGrid}>
            ▦ Grade
          </button>
          <div style={{ flex: 1 }} />
          {error && <span className="form-error" style={{ fontSize: "0.75rem" }}>{error}</span>}
          {info && <span className="form-ok" style={{ fontSize: "0.75rem" }}>{info}</span>}
        </div>
        {warn && <div className="drum-warn">{warn}</div>}
        <div style={{ margin: "0 16px" }}>
          <PercGuide />
        </div>
        <textarea
          className="edit-textarea"
          style={{ flex: 1, margin: "0 16px 12px" }}
          value={alphaTex}
          onChange={(e) => {
            lastEmittedRef.current = e.target.value;
            onChange(e.target.value);
          }}
          disabled={disabled}
          spellCheck={false}
        />
      </div>
    );
  }

  const cellGlyph = (mod: NoteMod | undefined) => {
    if (!mod) return null;
    return (
      <>
        {mod.flam && <span className="drum-g drum-g-flam">⌐</span>}
        {mod.accent && <span className="drum-g drum-g-acc">›</span>}
      </>
    );
  };

  // ── Modo grade ──
  return (
    <div className="drum-editor">
      <div className="drum-toolbar">
        <span className="drum-toolbar-label">Resolução</span>
        <div className="drum-res-group">
          {validResolutions.map((r) => (
            <button
              key={r.value}
              type="button"
              className={`drum-res-btn${res === r.value ? " active" : ""}`}
              onClick={() => changeRes(r.value)}
              disabled={disabled}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="drum-toolbar-sep" />

        <span className="drum-toolbar-label">Pincel</span>
        <div className="drum-res-group">
          {BRUSHES.map((b) => (
            <button
              key={b.key}
              type="button"
              className={`drum-res-btn${brush === b.key ? " active" : ""}`}
              onClick={() => setBrush(b.key)}
              disabled={disabled}
              title={b.hint}
            >
              {b.label}
            </button>
          ))}
        </div>

        <div className="drum-toolbar-sep" />

        <div className="drum-addlane">
          <button
            type="button"
            className="drum-addlane-btn"
            onClick={() => setAddLaneOpen((o) => !o)}
            disabled={disabled || hiddenPieces.length === 0}
            aria-expanded={addLaneOpen}
          >
            + peça
          </button>
          {addLaneOpen && (
            <div className="drum-addlane-pop">
              {hiddenPieces.map((p) => (
                <button key={p.midi} type="button" onClick={() => addLane(p.midi)}>
                  {p.label} <span className="drum-piece-midi">{p.midi}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          className="drum-mode-toggle"
          onClick={() => setTextMode(true)}
          title="Editar como texto alphaTex"
        >
          ⌨ Texto
        </button>

        <div style={{ flex: 1 }} />
        {error && <span className="form-error" style={{ fontSize: "0.75rem" }}>{error}</span>}
        {info && <span className="form-ok" style={{ fontSize: "0.75rem" }}>{info}</span>}
      </div>

      <div className="drum-hint">
        arraste para pintar · botão direito apaga · botão direito no nome da peça
        preenche a linha · clique em “compasso N” seleciona (Shift estende) ·
        Ctrl+C/V/D copia/cola/repete · Ctrl+Z desfaz
      </div>

      {selRange && (
        <div className="drum-selbar">
          <span className="drum-selbar-label">
            {selRange.from === selRange.to
              ? `compasso ${selRange.from + 1}`
              : `compassos ${selRange.from + 1}–${selRange.to + 1}`}
          </span>
          <button type="button" onClick={copySel} title="Copiar (Ctrl+C)">copiar</button>
          <button type="button" onClick={pasteSel} disabled={disabled} title="Colar aqui (Ctrl+V)">colar</button>
          <button type="button" onClick={duplicateSel} disabled={disabled} title="Repetir logo adiante (Ctrl+D)">repetir</button>
          <button type="button" onClick={clearSel} disabled={disabled} title="Limpar os golpes (Delete)">limpar</button>
          <button type="button" onClick={() => setSel(null)} title="Desfazer a seleção (Esc)">✕</button>
        </div>
      )}

      {warn && <div className="drum-warn">{warn}</div>}

      <div className="drum-scroll">
        <div className="drum-table">
          {/* Cabeçalho: compasso + tempos (com toggle de quiáltera "3") */}
          <div className="drum-row drum-row--head">
            <div className="drum-lane-label drum-lane-label--head" />
            {bars.map((bar, bi) => (
              <div
                className={`drum-bar drum-bar--head${inSel(bi) ? " selected" : ""}`}
                key={bi}
              >
                <div className="drum-bar-title">
                  <button
                    type="button"
                    className="drum-bar-name"
                    onClick={(e) => selectBar(bi, e.shiftKey)}
                    title="Selecionar este compasso (Shift+clique estende)"
                  >
                    Compasso {bi + 1}
                  </button>
                  {canEditStructure && (
                    <span className="drum-bar-ops">
                      <button type="button" title="Adicionar compasso depois" onClick={() => onAddMeasure?.(bi)}>+</button>
                      {bars.length > 1 && (
                        <button type="button" title="Remover este compasso" onClick={() => onDeleteMeasure?.(bi)}>×</button>
                      )}
                    </span>
                  )}
                </div>
                <div className="drum-beats-head">
                  {bar.beats.map((beat, bj) => (
                    <div
                      className="drum-beat-head"
                      key={bj}
                      style={{ minWidth: beat.cells.length * 24 }}
                    >
                      <span className="drum-beat-num">{bj + 1}</span>
                      <button
                        type="button"
                        className={`drum-tri${beat.triplet ? " on" : ""}`}
                        onClick={() => toggleTriplet(bi, bj)}
                        disabled={disabled || !canTriplet(res, tsDenOf(bi))}
                        title="Alternar quiáltera (tercina) neste tempo"
                      >
                        3
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Uma linha por peça */}
          {lanes.map((midi) => {
            const piece = PIECE_BY_MIDI.get(midi);
            const used = bars.some((b) =>
              b.beats.some((beat) => beat.cells.some((c) => c.has(midi))),
            );
            return (
              <div className="drum-row" key={midi}>
                <div
                  className={`drum-lane-label${laneMenu === midi ? " menu-open" : ""}`}
                  title={`MIDI ${midi} — botão direito: preencher/limpar a linha`}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (!disabled) setLaneMenu((m) => (m === midi ? null : midi));
                  }}
                >
                  <span className="drum-lane-name">{piece?.label ?? `#${midi}`}</span>
                  {!used && !disabled && lanes.length > 1 && (
                    <button
                      type="button"
                      className="drum-lane-hide"
                      onClick={() => removeLane(midi)}
                      title="Esconder esta peça (sem notas)"
                    >
                      ×
                    </button>
                  )}
                  {laneMenu === midi && (
                    <div className="drum-addlane-pop drum-lane-menu">
                      <button type="button" onClick={() => fillLane(midi, "beat")}>
                        preencher a cada tempo
                      </button>
                      <button type="button" onClick={() => fillLane(midi, "half")}>
                        preencher a cada ½ tempo
                      </button>
                      <button type="button" onClick={() => fillLane(midi, "cell")}>
                        preencher toda célula
                      </button>
                      <button type="button" onClick={() => fillLane(midi, "clear")}>
                        limpar a linha
                      </button>
                    </div>
                  )}
                </div>
                {bars.map((bar, bi) => (
                  <div
                    className={`drum-bar${inSel(bi) ? " selected" : ""}`}
                    key={bi}
                  >
                    {bar.beats.map((beat, bj) => (
                      <div
                        className={`drum-beat${beat.triplet ? " triplet" : ""}`}
                        key={bj}
                      >
                        {beat.cells.map((cell, ci) => {
                          const mod = cell.get(midi);
                          const on = !!mod;
                          const playing =
                            playPos !== null &&
                            playPos.bar === bi &&
                            playPos.beat === bj &&
                            playPos.cell === ci;
                          const cls = [
                            "drum-cell",
                            on ? "on" : "",
                            ci === 0 ? "beat" : "",
                            mod?.ghost ? "ghost" : "",
                            mod?.accent ? "accent" : "",
                            playing ? "playing" : "",
                          ]
                            .filter(Boolean)
                            .join(" ");
                          return (
                            <button
                              key={ci}
                              type="button"
                              className={cls}
                              onPointerDown={(e) => startPaint(e, bi, bj, ci, midi)}
                              onPointerEnter={() => dragOver(bi, bj, ci, midi)}
                              onContextMenu={(e) => e.preventDefault()}
                              disabled={disabled}
                              aria-pressed={on}
                              aria-label={`${piece?.label ?? midi} compasso ${bi + 1} tempo ${bj + 1}`}
                            >
                              {cellGlyph(mod)}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default DrumGridEditor;
