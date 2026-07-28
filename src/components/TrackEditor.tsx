"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import AlphaTabPlayer, { type AlphaTabPlayerHandle } from "@/components/AlphaTabPlayer";
import TabEditor, { type MeasureMeta, type TabEditorHandle } from "@/components/TabEditor";
import DrumGridEditor from "@/components/DrumGridEditor";
import {
  NOTE_OPTIONS,
  TUNING_PRESETS,
  splitTuningToken,
  tuningSummary,
} from "@/lib/tuning";

type Me = { id: string; displayName: string } | null;
type Content = {
  track: {
    id: string;
    order: number;
    name: string;
    isPercussion: boolean;
    /** Afinação atual (tokens aguda → grave); null = sem afinação editável. */
    tuning: string[] | null;
  };
  measureCount: number;
  alphaTex: string;
  trackHeader: string | null;
  measures: MeasureMeta[];
  song: { ownerId: string | null; ownerName: string | null; tempo: number | null };
};

type Preset = { key: string; label: string };

export default function TrackEditor({
  songId,
  tracks,
}: {
  songId: string;
  tracks: { order: number; name: string }[];
}) {
  const [me, setMe] = useState<Me>(null);
  // Lista de trilhas em estado local — uma trilha recém-declarada aparece na
  // hora no seletor, sem recarregar a página.
  const [trackList, setTrackList] = useState(tracks);
  const [trackOrder, setTrackOrder] = useState(tracks[0]?.order ?? 0);

  // ── Adicionar trilha (declarar instrumento) ──
  const [presets, setPresets] = useState<Preset[]>([]);
  const [adding, setAdding] = useState(false);
  const [newPreset, setNewPreset] = useState("");
  const [newName, setNewName] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [content, setContent] = useState<Content | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // ── Afinação e andamento (estrutura musical; só o dono) ──
  const [tuningOpen, setTuningOpen] = useState(false);
  const [tuningDraft, setTuningDraft] = useState<string[]>([]);
  const [tuningBusy, setTuningBusy] = useState(false);
  const [tuningError, setTuningError] = useState<string | null>(null);
  const [tempoDraft, setTempoDraft] = useState("");
  const [tempoBusy, setTempoBusy] = useState(false);
  const [tempoOpen, setTempoOpen] = useState(false);

  // Player external-control state
  const playerRef = useRef<AlphaTabPlayerHandle>(null);
  const editorRef = useRef<TabEditorHandle>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  // Recarrega o player quando a grade viva muda (save aceito) — senão ele
  // continua tocando a versão antiga.
  const [playerEpoch, setPlayerEpoch] = useState(0);
  // Última posição de playback (tick) — para retomar após recarregar o score.
  const lastTickRef = useRef(0);
  // Texto desta trilha atualmente carregado no player como PREVIEW de edição
  // não salva (null = o player está com o /assembled salvo).
  const previewTextRef = useRef<string | null>(null);

  // Encaminha o tick de playback (player headless) para o cursor do editor visual.
  const syncEditorCursor = useCallback((tick: number) => {
    lastTickRef.current = tick;
    editorRef.current?.seekTick(tick);
  }, []);

  // Clique num beat do editor → seek na música completa (tocando ou pausado).
  const seekPlayer = useCallback((tick: number) => {
    playerRef.current?.seekTick(tick);
  }, []);

  // Espera o áudio do score recém-carregado ficar pronto, retoma a posição e toca.
  const playWhenReady = useCallback(async () => {
    for (let i = 0; i < 24; i++) {
      const p = playerRef.current;
      if (p?.isReadyForPlayback()) {
        p.seekTick(lastTickRef.current);
        p.playPause();
        return;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }, []);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then(setMe)
      .catch(() => {});
    fetch(`/api/songs/${songId}/tracks`)
      .then((r) => r.json())
      .then((ps: Preset[]) => {
        setPresets(ps);
        setNewPreset(ps[0]?.key ?? "");
      })
      .catch(() => {});
  }, [songId]);

  // Declara um novo instrumento como trilha (bateria, teclado, mais uma
  // guitarra…) e já a seleciona para editar.
  async function addTrack() {
    if (!newPreset || addBusy) return;
    setAddBusy(true);
    setAddError(null);
    try {
      const res = await fetch(`/api/songs/${songId}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presetKey: newPreset, name: newName.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Falha ao adicionar a trilha.");
      setTrackList((list) =>
        [...list, { order: json.order, name: json.name }].sort((a, b) => a.order - b.order),
      );
      setTrackOrder(json.order); // dispara o carregamento da nova trilha
      // O /assembled ganhou uma trilha — recarrega o player headless para o
      // documento novo (senão ele segue com a montagem antiga até o 1º save).
      previewTextRef.current = null;
      setPlayerEpoch((n) => n + 1);
      setNewName("");
      setAdding(false);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setAddBusy(false);
    }
  }

  const ownerId = content?.song.ownerId ?? null;
  const ownerName = content?.song.ownerName ?? null;
  // Sem content carregado não dá para saber o papel — não assumir "dono".
  const isOwner = !!me && !!content && (!ownerId || ownerId === me.id);

  const loadTrack = useCallback(async () => {
    setError(null);
    setInfo(null);
    const res = await fetch(`/api/songs/${songId}/tracks/${trackOrder}/content`);
    if (!res.ok) return;
    const json: Content = await res.json();
    setContent(json);
    setText(json.alphaTex);
    setTempoDraft(json.song.tempo != null ? String(json.song.tempo) : "");
    setTuningOpen(false);
    setTempoOpen(false);
  }, [songId, trackOrder]);

  useEffect(() => { loadTrack(); }, [loadTrack]);

  // Trocar de trilha descarta o buffer local → o preview carregado no player
  // (se houver) não corresponde mais a nada; volta ao /assembled salvo.
  useEffect(() => {
    if (previewTextRef.current !== null) {
      previewTextRef.current = null;
      setPlayerEpoch((n) => n + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackOrder]);

  // Edição local ainda não salva? (formatação pode diferir; é só "buffer difere")
  const dirty = !!content && text !== content.alphaTex;

  // ── Play: toca O QUE VOCÊ ESTÁ VENDO ────────────────────────────────────────
  // Com edição não salva, monta a música completa com a trilha local aplicada
  // (endpoint de preview, nada é gravado) e carrega no player headless antes de
  // tocar. Sem edição pendente, toca o /assembled direto.
  async function handlePlayClick() {
    const p = playerRef.current;
    if (!p || !content) return;
    // Pausar nunca recarrega nada.
    if (isPlaying) { p.playPause(); return; }

    const needPreview = dirty && previewTextRef.current !== text;
    const needRestore = !dirty && previewTextRef.current !== null;
    if (!needPreview && !needRestore) { p.playPause(); return; }

    if (needRestore) {
      // Buffer voltou ao salvo → recarrega o /assembled e toca.
      previewTextRef.current = null;
      setPlayerEpoch((n) => n + 1);
      void playWhenReady();
      return;
    }

    setError(null);
    try {
      const res = await fetch(
        `/api/songs/${songId}/tracks/${trackOrder}/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alphaTex: text }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Falha na pré-visualização.");
      previewTextRef.current = text;
      p.loadTex(json.alphaTex);
      void playWhenReady();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao preparar o áudio.");
    }
  }

  // ── Salvar (dono) / Propor (colaborador) ────────────────────────────────────
  async function saveContent(): Promise<{ changed: number; accepted: boolean }> {
    const res = await fetch(`/api/songs/${songId}/tracks/${trackOrder}/content`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alphaTex: text }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error ?? "Falha.");
    return json;
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const json = await saveContent();

      if (json.changed === 0) {
        setInfo("Sem mudanças em relação à versão atual — nada a enviar.");
      } else if (json.accepted) {
        setInfo(`Salvo — ${json.changed} compasso(s) atualizado(s).`);
        // A grade viva mudou → recarrega o conteúdo e o player.
        previewTextRef.current = null;
        setPlayerEpoch((n) => n + 1);
        await loadTrack();
        setInfo(`Salvo — ${json.changed} compasso(s) atualizado(s).`);
      } else {
        // Proposta: NÃO recarrega o conteúdo — recarregar reverteria o buffer
        // para a versão aceita e a edição "sumiria" da tela (parecia que o
        // botão não fazia nada). A edição continua visível; o envio fica
        // registrado na aba Propostas da música.
        setInfo(
          `Proposta enviada — ${json.changed} compasso(s). ` +
            `Acompanhe na aba Propostas da música; ${ownerName ?? "o dono"} revisa antes de entrar.`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setBusy(false);
    }
  }

  // ── Estrutura: afinação da trilha e andamento (dono) ────────────────────────
  // Como nas operações de compasso: edição pendente é SALVA antes (nunca
  // descartada) — o loadTrack pós-mudança substituiria o buffer local.
  function openTuning() {
    if (!content?.track.tuning) return;
    setTuningDraft(
      content.track.tuning.map((t) => {
        const { note, octave } = splitTuningToken(t);
        return `${note}${octave}`;
      }),
    );
    setTuningError(null);
    setTuningOpen((o) => !o);
  }

  async function applyTuning() {
    if (tuningBusy) return;
    setTuningBusy(true);
    setTuningError(null);
    try {
      if (dirty) await saveContent();
      const res = await fetch(
        `/api/songs/${songId}/tracks/${trackOrder}/tuning`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tuning: tuningDraft }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Falha ao mudar a afinação.");
      previewTextRef.current = null;
      setPlayerEpoch((n) => n + 1);
      // loadTrack traz o header novo; o TabEditor re-renderiza em-place
      // (assinatura estrutural), sem remontar.
      await loadTrack();
      setInfo(`Afinação atualizada: ${tuningSummary(json.tuning)}.`);
    } catch (e) {
      setTuningError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setTuningBusy(false);
    }
  }

  // measure 0 = andamento inicial; N>0 = mudança a partir daquele compasso
  // (bpm null remove a mudança). OTIMISTA: o estado local muda na hora (o
  // editor re-renderiza em-place, sem remontar — era a "travadinha") e o POST
  // confirma por trás; erro reverte. Andamento não toca células, então não há
  // buffer a salvar nem trilha a recarregar.
  async function applyTempoAt(measure: number, bpm: number | null) {
    if (tempoBusy || !content) return;
    const prev = content;
    const stripTempo = (s: string | null) =>
      (s ?? "")
        .split(/\r?\n/)
        .filter((l) => !/^\s*\\tempo\b/i.test(l))
        .join("\n")
        .trim();
    setContent({
      ...content,
      measures: content.measures.map((m, i) => {
        if (i !== measure) return m;
        const base = stripTempo(m.structPrefix);
        // Compasso 1: o tempo inicial vive no header global (song.tempo) — o
        // structPrefix fica sem \tempo, como o servidor deixa.
        const next =
          measure === 0 || bpm === null ? base : `${base}\n\\tempo ${bpm}`.trim();
        return { ...m, structPrefix: next || null };
      }),
      song: {
        ...content.song,
        tempo: measure === 0 && bpm !== null ? bpm : content.song.tempo,
      },
    });
    if (measure === 0 && bpm !== null) setTempoDraft(String(bpm));
    setTempoBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/songs/${songId}/tempo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bpm, measure }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Falha ao mudar o andamento.");
      // Só o ÁUDIO precisa recarregar (o /assembled mudou) — em segundo plano.
      previewTextRef.current = null;
      setPlayerEpoch((n) => n + 1);
      setInfo(
        bpm === null
          ? `Mudança de andamento removida do compasso ${measure + 1}.`
          : measure === 0
            ? `Andamento: ${json.tempo} bpm.`
            : `Andamento: ${json.tempo} bpm a partir do compasso ${measure + 1}.`,
      );
    } catch (e) {
      setContent(prev); // reverte o otimismo
      setTempoDraft(prev.song.tempo != null ? String(prev.song.tempo) : "");
      setError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setTempoBusy(false);
    }
  }

  function applyTempo() {
    const bpm = Number(tempoDraft);
    if (!content || !tempoDraft.trim() || bpm === content.song.tempo) return;
    setTempoOpen(false);
    applyTempoAt(0, bpm);
  }

  // ── Estrutura: adicionar/remover compasso (dono; afeta todas as trilhas) ────
  // Compor do zero é feito compasso a compasso — obrigar a salvar manualmente
  // antes de cada "+" tornava isso impraticável. Em vez de descartar a edição
  // pendente, salva-a primeiro (só o dono chega aqui, canEditStructure) e só
  // então mexe na grade; nada se perde.
  async function addMeasureAfter(afterIndex: number) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (dirty) await saveContent();
      const res = await fetch(`/api/songs/${songId}/measures`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ afterOrder: afterIndex }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Falha.");
      setInfo(`Compasso adicionado após o ${afterIndex + 1}.`);
      previewTextRef.current = null;
      setPlayerEpoch((n) => n + 1);
      await loadTrack();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setBusy(false);
    }
  }

  async function removeMeasure(index: number) {
    if (busy) return;
    if (
      !window.confirm(
        `Remover o compasso ${index + 1} de TODAS as trilhas? As contribuições desse compasso serão apagadas.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (dirty) await saveContent();
      const res = await fetch(
        `/api/songs/${songId}/measures?order=${index}`,
        { method: "DELETE" },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Falha.");
      setInfo(`Compasso ${index + 1} removido.`);
      previewTextRef.current = null;
      setPlayerEpoch((n) => n + 1);
      await loadTrack();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="edit-main">
      {/* ── Controls bar ── */}
      <div className="edit-controls">
        <button
          type="button"
          className="playpause-btn"
          onClick={handlePlayClick}
          disabled={!playerReady}
          title={isPlaying ? "Pausar" : dirty ? "Tocar (com suas edições)" : "Tocar"}
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden>
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            // Triângulo simples, deslocado ~1px à direita p/ centro óptico.
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden>
              <polygon points="8,5 20,12 8,19" />
            </svg>
          )}
        </button>

        <div className="track-select-wrap">
          <select
            className="track-select"
            value={trackOrder}
            onChange={(e) => setTrackOrder(Number(e.target.value))}
            aria-label="Faixa a editar"
          >
            {trackList.map((t) => (
              <option key={t.order} value={t.order}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Adicionar uma trilha (declarar instrumento: bateria, teclado, etc.) */}
        <div className="add-track">
          <button
            type="button"
            className="add-track-btn"
            onClick={() => { setAdding((a) => !a); setAddError(null); }}
            disabled={!me || presets.length === 0}
            title={me ? "Adicionar uma trilha (bateria, teclado…)" : "Identifique-se para adicionar trilhas"}
            aria-expanded={adding}
          >
            + trilha
          </button>
          {adding && (
            <div className="add-track-pop">
              <div className="add-track-row">
                <select
                  value={newPreset}
                  onChange={(e) => setNewPreset(e.target.value)}
                  aria-label="Instrumento da nova trilha"
                >
                  {presets.map((p) => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="nome (opcional), ex.: Fender do Mick"
                  onKeyDown={(e) => { if (e.key === "Enter") addTrack(); }}
                />
                <button type="button" onClick={addTrack} disabled={addBusy || !newPreset}>
                  {addBusy ? "…" : "Adicionar"}
                </button>
              </div>
              <p className="add-track-hint">
                {newName.trim() ? (
                  <>vai aparecer como <strong>{presets.find((p) => p.key === newPreset)?.label ?? ""} — {newName.trim()}</strong></>
                ) : (
                  <>Cria uma trilha vazia (sem dono) — o convite para alguém preencher.</>
                )}
              </p>
              {addError && <div className="form-error" style={{ marginTop: 4 }}>{addError}</div>}
            </div>
          )}
        </div>

        {/* Afinação da trilha (dono; trilhas de corda). O popover edita corda a
            corda ou por preset; as casas existentes continuam, soando na altura nova. */}
        {isOwner && content?.track.tuning && (
          <div className="add-track">
            <button
              type="button"
              className="add-track-btn"
              onClick={openTuning}
              aria-expanded={tuningOpen}
              title="Afinação das cordas desta trilha"
            >
              afinação · {tuningSummary(content.track.tuning)}
            </button>
            {tuningOpen && (
              <div className="add-track-pop" style={{ minWidth: 260 }}>
                {(TUNING_PRESETS[tuningDraft.length] ?? []).length > 0 && (
                  <div className="add-track-row" style={{ marginBottom: 8 }}>
                    <select
                      value=""
                      aria-label="Preset de afinação"
                      onChange={(e) => {
                        const p = (TUNING_PRESETS[tuningDraft.length] ?? []).find(
                          (x) => x.label === e.target.value,
                        );
                        if (p) setTuningDraft([...p.tokens]);
                      }}
                    >
                      <option value="">escolher um preset…</option>
                      {(TUNING_PRESETS[tuningDraft.length] ?? []).map((p) => (
                        <option key={p.label} value={p.label}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                )}
                {/* Grid de 3 colunas fixas — rótulo, nota, oitava — para as
                    linhas ficarem alinhadas (rótulos de largura variável
                    desalinhavam os selects). */}
                <div className="tuning-grid">
                  {tuningDraft.map((token, i) => {
                    const { note, octave } = splitTuningToken(token);
                    return (
                      <Fragment key={i}>
                        <span className="tuning-grid-label">
                          corda {i + 1}
                          {i === 0 ? " · aguda" : i === tuningDraft.length - 1 ? " · grave" : ""}
                        </span>
                        <select
                          value={note}
                          aria-label={`Nota da corda ${i + 1}`}
                          onChange={(e) =>
                            setTuningDraft((d) =>
                              d.map((t, k) => (k === i ? `${e.target.value}${octave}` : t)),
                            )
                          }
                        >
                          {NOTE_OPTIONS.map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                        <select
                          value={octave}
                          aria-label={`Oitava da corda ${i + 1}`}
                          onChange={(e) =>
                            setTuningDraft((d) =>
                              d.map((t, k) => (k === i ? `${note}${e.target.value}` : t)),
                            )
                          }
                        >
                          {[0, 1, 2, 3, 4, 5].map((o) => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                      </Fragment>
                    );
                  })}
                </div>
                <div className="add-track-row" style={{ marginTop: 8 }}>
                  <button type="button" onClick={applyTuning} disabled={tuningBusy}>
                    {tuningBusy ? "…" : "Aplicar afinação"}
                  </button>
                </div>
                <p className="add-track-hint">
                  As casas escritas continuam as mesmas — a trilha passa a soar na
                  afinação nova (vale para todo mundo).
                </p>
                {tuningError && (
                  <div className="form-error" style={{ marginTop: 4 }}>{tuningError}</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Andamento inicial (dono) — botão compacto, mesmo padrão do de
            afinação. No meio da música: clicar numa marca ♩=N da partitura
            (ou o botão ♩= da toolbar com um compasso selecionado). */}
        {isOwner && content && (
          <div className="add-track">
            <button
              type="button"
              className="add-track-btn"
              onClick={() => {
                setTempoDraft(
                  content.song.tempo != null ? String(content.song.tempo) : "",
                );
                setTempoOpen((o) => !o);
              }}
              aria-expanded={tempoOpen}
              title="Andamento inicial da música"
            >
              ♩ {content.song.tempo ?? "—"}
            </button>
            {tempoOpen && (
              <div className="add-track-pop" style={{ minWidth: 230 }}>
                <div className="tab-editor-tempo-pop-row">
                  <span className="tempo-ctl">
                    ♩=
                    <input
                      type="number"
                      className="tempo-input"
                      min={20}
                      max={400}
                      value={tempoDraft}
                      placeholder="120"
                      autoFocus
                      onChange={(e) => setTempoDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") applyTempo();
                        if (e.key === "Escape") setTempoOpen(false);
                      }}
                      aria-label="Andamento inicial (bpm)"
                    />
                    bpm
                  </span>
                  <button
                    type="button"
                    className="add-track-btn"
                    onClick={applyTempo}
                    disabled={tempoBusy || !tempoDraft.trim()}
                  >
                    {tempoBusy ? "…" : "Aplicar"}
                  </button>
                </div>
                <p className="add-track-hint">
                  Para mudar o andamento no meio da música, clique na marca ♩=N
                  na partitura — ou selecione um compasso e use o ♩= da toolbar.
                </p>
              </div>
            )}
          </div>
        )}

        {content && ownerName && (
          <span className={`edit-role-badge${isOwner ? " owner" : ""}`}>
            {isOwner ? "dono — salva direto" : `proposta · revisada por ${ownerName}`}
          </span>
        )}
        {content && !ownerName && me && (
          <span className="edit-role-badge owner">
            música aberta (sem dono) — salva direto
          </span>
        )}
        {!me && (
          <span className="edit-role-badge">identifique-se para editar</span>
        )}

        <div style={{ flex: 1 }} />

        <button
          type="button"
          className="btn-edit-save"
          onClick={submit}
          disabled={busy || !content || !me}
        >
          {!content ? "Carregando…" : isOwner ? "Salvar a trilha" : "Propor a trilha"}
        </button>
      </div>

      {/* ── Player headless: sem tablatura visível, só o áudio ──
          O play de cima toca a música completa montada (todas as faixas + o que
          já foi editado). O espaço da tela é todo do editor. */}
      <AlphaTabPlayer
        ref={playerRef}
        key={`${songId}#${playerEpoch}`}
        alphaTexUrl={`/api/songs/${songId}/assembled`}
        editMode
        audioOnly
        onPlayingChange={setIsPlaying}
        onPlayerReadyChange={setPlayerReady}
        onTickChange={syncEditorCursor}
      />

      {/* ── Editor em tela cheia (propostas moram na aba Propostas da música) ──
          Só monta quando o content é DA TRILHA SELECIONADA: durante a troca o
          content antigo ainda está no state e montaria o editor com o texto
          (e o flag de percussão) da trilha errada. */}
      <div className="edit-bottom">
        {content && content.track.order === trackOrder ? (
          content.track.isPercussion ? (
            <DrumGridEditor
              key={trackOrder}
              ref={editorRef}
              alphaTex={text}
              onChange={setText}
              disabled={!me}
              measureMeta={content.measures}
              canEditStructure={isOwner && !!me}
              onAddMeasure={addMeasureAfter}
              onDeleteMeasure={removeMeasure}
              error={error}
              info={info}
            />
          ) : (
            <TabEditor
              key={trackOrder}
              ref={editorRef}
              alphaTex={text}
              onChange={setText}
              disabled={!me}
              trackStringCount={content.track.tuning?.length ?? (/baixo|bass/i.test(content.track.name) ? 4 : 6)}
              trackHeader={content.trackHeader}
              measureMeta={content.measures}
              onSeek={seekPlayer}
              percussion={content.track.isPercussion}
              canEditStructure={isOwner && !!me}
              onAddMeasure={addMeasureAfter}
              onDeleteMeasure={removeMeasure}
              onSetMeasureTempo={applyTempoAt}
              initialTempo={content.song.tempo}
              error={error}
              info={info}
            />
          )
        ) : (
          <div className="edit-editor">
            <div className="player-loading" style={{ flex: 1 }}>Carregando…</div>
          </div>
        )}
      </div>
    </div>
  );
}
