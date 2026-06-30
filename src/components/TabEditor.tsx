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
  { value: "b",  label: "b", title: "Bend"      },
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
  /** Mensagem de erro vinda do TrackEditor. */
  error?: string | null;
  /** Mensagem de sucesso/info vinda do TrackEditor. */
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

  // Refs para evitar closures obsoletas nos event handlers do alphaTab
  const modelRef  = useRef<EditorModel>(model);
  const cursorRef = useRef<EditorCursor>(cursor);
  const surfaceRef  = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<AlphaTabApi | null>(null);
  // Detecta transição rawMode true → false para sincronizar o alphaTab
  const prevRawModeRef = useRef(false);

  useEffect(() => { modelRef.current = model; }, [model]);
  useEffect(() => { cursorRef.current = cursor; }, [cursor]);

  // ── Fix 2: surface sempre no DOM ───────────────────────────────────────────
  // Quando o usuário sai do modo texto e volta ao visual, sincroniza o alphaTab
  // com o modelo atual (que pode ter sido editado no textarea).
  useEffect(() => {
    if (!rawMode && prevRawModeRef.current && apiRef.current) {
      apiRef.current.tex(serializeModel(modelRef.current));
    }
    prevRawModeRef.current = rawMode;
  }, [rawMode]);

  // ── Inicialização do alphaTab (uma vez na montagem) ────────────────────────
  useEffect(() => {
    let api: AlphaTabApi | null = null;
    let disposed = false;

    (async () => {
      const at = await import("@coderline/alphatab");
      if (disposed || !surfaceRef.current) return;

      api = new at.AlphaTabApi(surfaceRef.current, {
        core: {
          fontDirectory: "/font/",
          // Necessário para que noteMouseDown dispare ao clicar numa nota.
          // Sem isso, o alphaTab não calcula as bounds individuais de cada nota
          // e o evento nunca é acionado (ver _setupClickHandling no bundle).
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
          enableCursor:          false,  // cursor de playback desativado
          enableUserInteraction: true,   // habilita noteMouseDown
          soundFont:             "/soundfont/sonivox.sf2",
          scrollElement:         viewportRef.current ?? undefined,
          scrollMode:            at.ScrollMode.Continuous,
        },
      });

      api.scoreLoaded.on(() => {
        setApiReady(true);
        // Foca o viewport logo após a partitura carregar para que o
        // teclado funcione imediatamente.
        requestAnimationFrame(() => viewportRef.current?.focus());
      });

      // beatMouseDown dispara em QUALQUER beat (notas E rests) sem precisar
      // de includeNoteBounds. Permite selecionar o cursor clicando em qualquer
      // posição da tablatura, incluindo compassos vazios.
      api.beatMouseDown.on((beat) => {
        const measureIndex = beat.voice.bar.index;
        const beatIndex    = beat.index;
        // Mantém a corda atual do cursor; se não houver, usa a 1ª corda.
        const string = cursorRef.current?.string ?? 1;
        setCursor({ measureIndex, beatIndex, string });
        viewportRef.current?.focus();
      });

      // noteMouseDown (requer includeNoteBounds:true) refina a corda quando
      // o clique foi diretamente sobre um número de casa existente.
      // Dispara logo após beatMouseDown, sobrescrevendo a corda com precisão.
      api.noteMouseDown.on((note) => {
        const measureIndex = note.beat.voice.bar.index;
        const beatIndex    = note.beat.index;
        const string       = note.string;
        setCursor({ measureIndex, beatIndex, string });
        // focus já foi chamado pelo beatMouseDown acima
      });

      api.error.on((err) => {
        console.error("[TabEditor] alphaTab error:", err);
      });

      apiRef.current = api;
      api.tex(alphaTex);
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

      // Dígito 0–9 → define a casa da nota selecionada
      if (/^[0-9]$/.test(e.key)) {
        if (!cur) return;
        e.preventDefault();
        applyModel(setNote(mod, cur.measureIndex, cur.beatIndex, cur.string, parseInt(e.key, 10)));
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

  function activeEffects(): NoteEffect[] {
    if (!cursor) return [];
    const beat = model.measures[cursor.measureIndex]?.beats[cursor.beatIndex];
    return beat?.notes.find((n) => n.string === cursor.string)?.effects ?? [];
  }
  const effects = activeEffects();

  // ── Render ──────────────────────────────────────────────────────────────────
  //
  // Fix 2 — a <div ref={surfaceRef}> NUNCA sai do DOM.
  // Quando rawMode=true, um overlay absoluto cobre o editor visual.
  // Assim o alphaTab mantém sua instância e o canvas tem sempre dimensões válidas.
  // Ao retornar do rawMode, o useEffect acima chama api.tex() para sincronizar.
  //
  return (
    <div className="tab-editor" style={{ position: "relative" }}>

      {/* ── Cabeçalho: label + toggle ── */}
      <div className="tab-editor-header">
        <span className="tab-editor-section-label">
          {rawMode ? "Tablatura da faixa (texto)" : "Editor visual"}
        </span>
        <div className="tab-editor-header-right">
          {error && <span className="form-error" style={{ fontSize: "0.75rem" }}>{error}</span>}
          {info  && <span className="form-ok"   style={{ fontSize: "0.75rem" }}>{info}</span>}
          <button
            type="button"
            className="tab-editor-raw-toggle"
            onClick={() => setRawMode((m) => !m)}
          >
            {rawMode ? "usar editor visual" : "editar como texto"}
          </button>
        </div>
      </div>

      {/* ── Toolbar — visível apenas no modo visual ── */}
      {!rawMode && (
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

          {!cursor && (
            <>
              <div className="tab-editor-toolbar-sep" />
              <span className="tab-editor-pos">Clique num número da tablatura para selecionar</span>
            </>
          )}
        </div>
      )}

      {/* ── Viewport com alphaTab — SEMPRE no DOM ──
          Quando rawMode=true fica coberto pelo overlay abaixo, mas o canvas
          continua com dimensões válidas e o alphaTab mantém a instância.  */}
      <div
        ref={viewportRef}
        className="tab-editor-viewport"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-label="Editor de tablatura. Clique num número para selecionar e use o teclado para editar."
        style={{ visibility: rawMode ? "hidden" : "visible" }}
      >
        {!apiReady && !rawMode && (
          <div className="player-loading">Carregando editor…</div>
        )}
        <div ref={surfaceRef} className="player-surface" />

        {!rawMode && (
          <div className="tab-editor-kbd-hints">
            <span><kbd className="tab-editor-key">0–9</kbd> casa</span>
            <span><kbd className="tab-editor-key">← →</kbd> beat</span>
            <span><kbd className="tab-editor-key">↑ ↓</kbd> corda</span>
            <span><kbd className="tab-editor-key">r</kbd> rest</span>
            <span><kbd className="tab-editor-key">i</kbd> inserir beat</span>
            <span><kbd className="tab-editor-key">Del</kbd> apagar</span>
          </div>
        )}
      </div>

      {/* ── Overlay do modo texto — cobre o editor visual ──
          Usa position:absolute para sobrepor sem remover o surface do DOM. */}
      {rawMode && (
        <div className="tab-editor-raw-overlay">
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
      )}
    </div>
  );
}
