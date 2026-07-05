"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AlphaTabPlayer, { type AlphaTabPlayerHandle } from "@/components/AlphaTabPlayer";
import TabEditor, { type MeasureMeta, type TabEditorHandle } from "@/components/TabEditor";

type Me = { id: string; displayName: string } | null;
type Content = {
  track: { id: string; order: number; name: string; isPercussion: boolean };
  measureCount: number;
  alphaTex: string;
  trackHeader: string | null;
  measures: MeasureMeta[];
  song: { ownerId: string | null; ownerName: string | null };
};

/** Nº de cordas real, extraído da \tuning do header da trilha (ex.: baixo = 4). */
function stringCountFromHeader(header: string | null): number | null {
  const m = header?.match(/\\tuning\s*\(([^)]+)\)/);
  if (!m) return null;
  const n = m[1].trim().split(/\s+/).length;
  return n >= 3 && n <= 8 ? n : null;
}

export default function TrackEditor({
  songId,
  tracks,
}: {
  songId: string;
  tracks: { order: number; name: string }[];
}) {
  const [me, setMe] = useState<Me>(null);
  const [trackOrder, setTrackOrder] = useState(tracks[0]?.order ?? 0);
  const [content, setContent] = useState<Content | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

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
  }, []);

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
          {isPlaying ? "⏸" : "▶"}
        </button>

        <div className="track-select-wrap">
          <select
            className="track-select"
            value={trackOrder}
            onChange={(e) => setTrackOrder(Number(e.target.value))}
            aria-label="Faixa a editar"
          >
            {tracks.map((t) => (
              <option key={t.order} value={t.order}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

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
          <TabEditor
            key={trackOrder}
            ref={editorRef}
            alphaTex={text}
            onChange={setText}
            disabled={!me}
            trackStringCount={stringCountFromHeader(content.trackHeader) ?? (/baixo|bass/i.test(content.track.name) ? 4 : 6)}
            trackHeader={content.trackHeader}
            measureMeta={content.measures}
            onSeek={seekPlayer}
            percussion={content.track.isPercussion}
            canEditStructure={isOwner && !!me}
            onAddMeasure={addMeasureAfter}
            onDeleteMeasure={removeMeasure}
            error={error}
            info={info}
          />
        ) : (
          <div className="edit-editor">
            <div className="player-loading" style={{ flex: 1 }}>Carregando…</div>
          </div>
        )}
      </div>
    </div>
  );
}
