"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type EditorCursor,
  type EditorModel,
  type NoteEffect,
  deleteBeat,
  deleteNote,
  insertBeat,
  parseTrackTex,
  serializeModel,
  setBeatDuration,
  setNote,
  setRest,
  toggleEffect,
} from "@/lib/alphatex-editor";

// ── Tipos alphaTab (importados dinamicamente) ──────────────────────────────────
type AlphaTabModule = typeof import("@coderline/alphatab");
type AlphaTabApi = InstanceType<AlphaTabModule["AlphaTabApi"]>;

// ── Constantes da UI ────────────────────────────────────────────────────────────

const DURATIONS: Array<{ value: 1 | 2 | 4 | 8 | 16; label: string; title: string }> = [
  { value: 1,  label: "1",  title: "Semibreve"    },
  { value: 2,  label: "2",  title: "Mínima"       },
  { value: 4,  label: "4",  title: "Semínima"     },
  { value: 8,  label: "8",  title: "Colcheia"     },
  { value: 16, label: "16", title: "Semicolcheia" },
];

const EFFECTS: Array<{ value: NoteEffect; label: string; title: string }> = [
  { value: "b",  label: "b", title: "Bend"     },
  { value: "h",  label: "h", title: "Hammer-on" },
  { value: "p",  label: "p", title: "Pull-off"  },
  { value: "sl", label: "/", title: "Slide"     },
  { value: "v",  label: "~", title: "Vibrato"   },
];

// Nomes de cordas (string 1 = mais aguda)
const STRING_NAMES_6 = ["e", "B", "G", "D", "A", "E"];
const STRING_NAMES_4 = ["G", "D", "A", "E"];

function stringName(s: number, count: number): string {
  const names = count === 4 ? STRING_NAMES_4 : STRING_NAMES_6;
  return names[s - 1] ?? String(s);
}

// ── Props ───────────────────────────────────────────────────────────────────────

type Props = {
  alphaTex: string;
  onChange: (tex: string) => void;
  disabled?: boolean;
  /** 6 para guitarra, 4 para baixo. Default 6. */
  trackStringCount?: number;
  /** Mensagem de erro a exibir (vinda do TrackEditor). */
  error?: string | null;
  /** Mensagem de sucesso/info a exibir. */
  info?: string | null;
};

// ── Componente ──────────────────────────────────────────────────────────────────

export default function TabEditor({
  alphaTex,
  onChange,
  disabled = false,
  trackStringCount = 6,
  error,
  info,
}: Props) {
  // ── Estado interno ─────────────────────────────────────────────────────────
  const [model, setModel] = useState<EditorModel>(() => parseTrackTex(alphaTex));
  const [cursor, setCursor] = useState<EditorCursor>(null);
  const [duration, setDuration] = useState<1 | 2 | 4 | 8 | 16>(4);
  const [rawMode, setRawMode] = useState(false);
  const [apiReady, setApiReady] = useState(false);

  // Refs para evitar closures obsoletas nos event handlers
  const modelRef  = useRef<EditorModel>(model);
  const cursorRef = useRef<EditorCursor>(cursor);
  const surfaceRef  = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<AlphaTabApi | null>(null);

  // Mantém refs em sincronia com o estado
  useEffect(() => { modelRef.current = model; }, [model]);
  useEffect(() => { cursorRef.current = cursor; }, [cursor]);

  // ── Inicialização do alphaTab ──────────────────────────────────────────────
  useEffect(() => {
    let api: AlphaTabApi | null = null;
    let disposed = false;

    (async () => {
      const at = await import("@coderline/alphatab");
      if (disposed || !surfaceRef.current) return;

      api = new at.AlphaTabApi(surfaceRef.current, {
        core: { fontDirectory: "/font/" },
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
          enableCursor:          false,   // cursor de playback desativado
          enableUserInteraction: true,    // necessário para noteMouseDown
          soundFont:             "/soundfont/sonivox.sf2",
          scrollElement:         viewportRef.current ?? undefined,
          scrollMode:            at.ScrollMode.Continuous,
        },
      });

      // Score carregada → editor pronto
      api.scoreLoaded.on(() => setApiReady(true));

      // Clique numa nota → define cursor
      api.noteMouseDown.on((note) => {
        const measureIndex = note.beat.voice.bar.index;
        const beatIndex    = note.beat.index;
        const string       = note.string;
        setCursor({ measureIndex, beatIndex, string });
        return false; // impede seleção padrão do alphaTab
      });

      api.error.on((err) => {
        console.error("[TabEditor] alphaTab error:", err);
      });

      apiRef.current = api;
      // Carrega o alphaTex inicial
      api.tex(alphaTex);
    })();

    return () => {
      disposed = true;
      apiRef.current = null;
      api?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Apenas na montagem — remontagem via key={trackOrder} no pai

  // ── Aplicar modelo ao alphaTab e notificar pai ─────────────────────────────
  const applyModel = useCallback(
    (newModel: EditorModel) => {
      const tex = serializeModel(newModel);
      setModel(newModel);
      onChange(tex);
      apiRef.current?.tex(tex);
    },
    [onChange],
  );

  // ── Handler de teclado ─────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      const cur = cursorRef.current;
      const mod = modelRef.current;

      // Dígito 0–9 → define a casa
      if (/^[0-9]$/.test(e.key)) {
        if (!cur) return;
        e.preventDefault();
        const fret = parseInt(e.key, 10);
        applyModel(setNote(mod, cur.measureIndex, cur.beatIndex, cur.string, fret));
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
              beatIndex:    prev ? prev.beats.length - 1 : 0,
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
          const next = insertBeat(mod, cur.measureIndex, cur.beatIndex);
          applyModel(next);
          setCursor({ ...cur, beatIndex: cur.beatIndex + 1 });
          break;
        }
        case "Backspace":
        case "Delete": {
          e.preventDefault();
          if (!cur) return;
          const beat = mod.measures[cur.measureIndex]?.beats[cur.beatIndex];
          if (!beat) return;
          // Se há nota nesta corda: apaga só ela; senão, apaga o beat inteiro
          if (beat.notes.some((n) => n.string === cur.string)) {
            applyModel(deleteNote(mod, cur.measureIndex, cur.beatIndex, cur.string));
          } else {
            const next = deleteBeat(mod, cur.measureIndex, cur.beatIndex);
            applyModel(next);
            const newBeatIdx = Math.min(
              cur.beatIndex,
              (next.measures[cur.measureIndex]?.beats.length ?? 1) - 1,
            );
            setCursor({ ...cur, beatIndex: newBeatIdx });
          }
          break;
        }
      }
    },
    [applyModel, disabled, trackStringCount],
  );

  // ── Duração ────────────────────────────────────────────────────────────────
  function handleDurationChange(d: 1 | 2 | 4 | 8 | 16) {
    setDuration(d);
    const cur = cursorRef.current;
    const mod = modelRef.current;
    if (cur) applyModel(setBeatDuration(mod, cur.measureIndex, cur.beatIndex, d));
  }

  // ── Efeito ─────────────────────────────────────────────────────────────────
  function handleEffectToggle(effect: NoteEffect) {
    const cur = cursorRef.current;
    const mod = modelRef.current;
    if (!cur) return;
    applyModel(toggleEffect(mod, cur.measureIndex, cur.beatIndex, cur.string, effect));
  }

  // Efeitos ativos na nota sob o cursor
  function activeEffects(): NoteEffect[] {
    if (!cursor) return [];
    const beat = model.measures[cursor.measureIndex]?.beats[cursor.beatIndex];
    if (!beat) return [];
    return beat.notes.find((n) => n.string === cursor.string)?.effects ?? [];
  }

  const effects = activeEffects();

  // ── Modo texto (fallback) ──────────────────────────────────────────────────
  if (rawMode) {
    return (
      <div className="edit-editor">
        <div className="edit-editor-head">
          <span className="edit-editor-label">Tablatura da faixa (texto)</span>
          <button
            type="button"
            className="tab-editor-raw-toggle"
            onClick={() => setRawMode(false)}
          >
            usar editor visual
          </button>
        </div>
        <textarea
          className="edit-textarea"
          value={alphaTex}
          onChange={(e) => {
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
    );
  }

  // ── Editor visual ──────────────────────────────────────────────────────────
  return (
    <div className="tab-editor">

      {/* Cabeçalho: label + toggle para modo texto */}
      <div className="tab-editor-header">
        <span className="tab-editor-section-label">Editor visual</span>
        <div className="tab-editor-header-right">
          {error && <span className="form-error" style={{ fontSize: "0.75rem" }}>{error}</span>}
          {info  && <span className="form-ok"   style={{ fontSize: "0.75rem" }}>{info}</span>}
          <button
            type="button"
            className="tab-editor-raw-toggle"
            onClick={() => setRawMode(true)}
          >
            editar como texto
          </button>
        </div>
      </div>

      {/* Toolbar: duração + efeitos + posição do cursor */}
      <div className="tab-editor-toolbar">
        <span className="tab-editor-toolbar-label">Dur.</span>
        <div className="tab-editor-toolbar-group">
          {DURATIONS.map((d) => (
            <button
              key={d.value}
              type="button"
              className={`tab-editor-btn${duration === d.value ? " active" : ""}`}
              title={d.title}
              onClick={() => handleDurationChange(d.value)}
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
              disabled={!cursor}
            >
              {ef.label}
            </button>
          ))}
        </div>

        {cursor && (
          <>
            <div className="tab-editor-toolbar-sep" />
            <span className="tab-editor-pos">
              Comp.{" "}<strong>{cursor.measureIndex + 1}</strong>
              {" · "}Beat{" "}<strong>{cursor.beatIndex + 1}</strong>
              {" · "}Corda{" "}<strong>{cursor.string} ({stringName(cursor.string, trackStringCount)})</strong>
            </span>
          </>
        )}
      </div>

      {/* Viewport do alphaTab — recebe o foco para os eventos de teclado */}
      <div
        ref={viewportRef}
        className="tab-editor-viewport"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-label="Editor de tablatura. Clique numa nota para selecionar e use o teclado para editar."
      >
        {!apiReady && (
          <div className="player-loading">Carregando editor…</div>
        )}
        <div ref={surfaceRef} className="player-surface" />

        {/* Hints de teclado */}
        <div className="tab-editor-kbd-hints">
          <span><kbd className="tab-editor-key">0–9</kbd> casa</span>
          <span><kbd className="tab-editor-key">← →</kbd> beat</span>
          <span><kbd className="tab-editor-key">↑ ↓</kbd> corda</span>
          <span><kbd className="tab-editor-key">r</kbd> rest</span>
          <span><kbd className="tab-editor-key">i</kbd> inserir beat</span>
          <span><kbd className="tab-editor-key">Del</kbd> apagar</span>
        </div>
      </div>
    </div>
  );
}
