"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AlphaTabPlayer from "@/components/AlphaTabPlayer";
import TabSnippet from "@/components/TabSnippet";
import { diffStat } from "@/lib/linediff";
import {
  parseTrackTex,
  serializeForRender,
  type EditorBeat,
} from "@/lib/alphatex-editor";

type Me = { id: string; displayName: string } | null;
type Proposal = {
  trackOrder: number;
  trackName: string;
  authorId: string | null;
  authorName: string;
  count: number;
  /** Compassos que mudaram na música desde que a proposta foi escrita. */
  conflicts: number;
};
/** Um compasso em conflito, com as duas versões lado a lado. `ts` e
 *  `structPrefix` acompanham para renderizar o compasso como tablatura. */
type ConflictBar = {
  measureOrder: number;
  bar: number;
  current: string;
  proposed: string;
  tsNum: number;
  tsDen: number;
  structPrefix: string | null;
};
type ProposalsResponse = {
  song: { ownerId: string | null; ownerName: string | null };
  proposals: Proposal[];
};

const keyOf = (p: Proposal) => `${p.trackOrder}::${p.authorId ?? p.authorName}`;

// Assinatura canônica de um beat, para comparar a versão atual e a proposta.
const sig = (b: EditorBeat) => JSON.stringify(b);

/** Índices em `pro` que são novos ou mudados, isto é, não casam por LCS com `cur`. */
function addedIndices(cur: string[], pro: string[]): number[] {
  const n = cur.length;
  const m = pro.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = cur[i] === pro[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const added: number[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (cur[i] === pro[j]) { i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { i++; }
    else { added.push(j); j++; }
  }
  while (j < m) added.push(j++);
  return added;
}

/** Beats a destacar, no formato "measureIndex:beatIndex": os que a proposta mudou. */
function computeHighlights(current: string, proposed: string): string[] {
  const cm = parseTrackTex(current).measures;
  const pm = parseTrackTex(proposed).measures;
  const out: string[] = [];
  const n = Math.max(cm.length, pm.length);
  for (let i = 0; i < n; i++) {
    const curSigs = (cm[i]?.beats ?? []).map(sig);
    const proSigs = (pm[i]?.beats ?? []).map(sig);
    const same =
      curSigs.length === proSigs.length && curSigs.every((s, k) => s === proSigs[k]);
    if (same) continue;
    for (const idx of addedIndices(curSigs, proSigs)) out.push(`${i}:${idx}`);
  }
  return out;
}

type Detail = {
  add: number;
  del: number;
  highlight: string[];
  conflicts: ConflictBar[];
  trackHeader: string | null;
  isPercussion: boolean;
} | null;

/** Documento alphaTex renderizável de um compasso em conflito, pela mesma via do
 *  editor visual. A fórmula de compasso vai explícita: um compasso solto seria
 *  lido como 4/4 por padrão. */
function conflictBarTex(
  fragment: string,
  c: ConflictBar,
  trackHeader: string | null,
): string {
  let struct = c.structPrefix?.trim() ?? "";
  if (!/\\ts\b/.test(struct)) {
    struct = [`\\ts ${c.tsNum} ${c.tsDen}`, struct].filter(Boolean).join("\n");
  }
  return serializeForRender(parseTrackTex(fragment), {
    trackHeader,
    structPrefixes: [struct],
  });
}

export default function ProposalsPanel({
  songId,
  refreshRevisions,
  onReviewed,
}: {
  songId: string;
  /** Aceitar cria um snapshot no histórico: avisa o pai para recarregar. */
  refreshRevisions: () => Promise<void>;
  /** Aceitar ou recusar muda a fila: avisa o pai para atualizar o badge da aba. */
  onReviewed?: () => void;
}) {
  const [me, setMe] = useState<Me>(null);
  const [data, setData] = useState<ProposalsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [open, setOpen] = useState<Proposal | null>(null);
  const [detail, setDetail] = useState<Detail>(null); // null = carregando
  // Escolha do dono por compasso em conflito (measureOrder → versão).
  const [choices, setChoices] = useState<Record<number, "current" | "proposed">>({});
  // Sequência do fetch de detalhe: invalida respostas de proposta já fechada.
  const detailSeqRef = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/songs/${songId}/proposals`);
      if (res.ok) {
        setData(await res.json());
      } else {
        setError("Não foi possível carregar as propostas — recarregue a página.");
      }
    } catch {
      setError("Falha de rede ao carregar as propostas.");
    }
  }, [songId]);

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then(setMe).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  function openProposal(p: Proposal) {
    setOpen(p);
    setDetail(null);
    setChoices({});
    // Guard de corrida: abrir A e logo em seguida B dispara dois fetches; sem
    // invalidar o primeiro, o diff/realce de A podia aterrissar na tela de B.
    const seq = ++detailSeqRef.current;
    const empty: Detail = {
      add: 0, del: 0, highlight: [], conflicts: [], trackHeader: null, isPercussion: false,
    };
    fetch(`/api/songs/${songId}/tracks/${p.trackOrder}/proposal?author=${p.authorId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (c: {
          currentAlphaTex: string;
          proposedAlphaTex: string;
          conflicts?: ConflictBar[];
          trackHeader?: string | null;
          isPercussion?: boolean;
        } | null) => {
          if (seq !== detailSeqRef.current) return;
          if (!c) { setDetail(empty); return; }
          const stat = diffStat(c.currentAlphaTex, c.proposedAlphaTex);
          setDetail({
            ...stat,
            highlight: computeHighlights(c.currentAlphaTex, c.proposedAlphaTex),
            conflicts: c.conflicts ?? [],
            trackHeader: c.trackHeader ?? null,
            isPercussion: c.isPercussion ?? false,
          });
        },
      )
      .catch(() => {
        if (seq === detailSeqRef.current) setDetail(empty);
      });
  }
  function close() { setOpen(null); setDetail(null); setChoices({}); }

  async function review(p: Proposal, action: "accept" | "reject") {
    if (busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(
        `/api/songs/${songId}/tracks/${p.trackOrder}/accept`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // As escolhas por compasso em conflito acompanham o aceite.
          body: JSON.stringify({ authorId: p.authorId, action, resolutions: choices }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Falha.");
      setInfo(
        action === "accept"
          ? `Proposta de ${p.authorName} aceita — entrou na música.`
          : `Proposta de ${p.authorName} recusada.`,
      );
      close();
      await load();
      onReviewed?.();
      if (action === "accept") await refreshRevisions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <div className="proposals-panel">
        {error ? <p className="form-error">{error}</p> : <p className="sub">Carregando…</p>}
      </div>
    );
  }

  const isOwner = !!me && (!data.song.ownerId || data.song.ownerId === me.id);
  const visible = isOwner
    ? data.proposals
    : data.proposals.filter((p) => p.authorId && p.authorId === me?.id);

  // ── Detalhe: tablatura em tela cheia com o diff na partitura ────────────────
  if (open) {
    const conflicts = detail?.conflicts ?? [];
    const unresolved = conflicts.filter((c) => !choices[c.measureOrder]).length;
    return (
      <div className="proposal-detail">
        <div className="proposal-detail-head">
          <div className="proposal-detail-meta">
            <strong>{open.authorName}</strong> · {open.trackName}
            {detail && (
              <span className="proposal-detail-stat">
                {" · "}
                <span className="add">+{detail.add}</span>{" "}
                <span className="del">−{detail.del}</span>
                {conflicts.length > 0 && (
                  <span className="conflict-count">
                    {" "}· {conflicts.length} conflito{conflicts.length === 1 ? "" : "s"}
                  </span>
                )}
                <span className="proposal-legend"> · verde = mudou nesta proposta</span>
              </span>
            )}
          </div>
          <div className="proposal-detail-actions">
            {isOwner && (
              <>
                <button
                  type="button"
                  className="btn-accept"
                  onClick={() => review(open, "accept")}
                  disabled={busy || detail === null || unresolved > 0}
                  title={
                    unresolved > 0
                      ? `escolha a versão de ${unresolved} compasso(s) em conflito`
                      : undefined
                  }
                >
                  {unresolved > 0 ? `Aceitar (${unresolved} sem escolha)` : "Aceitar"}
                </button>
                <button type="button" className="btn-reject" onClick={() => review(open, "reject")} disabled={busy}>
                  Recusar
                </button>
              </>
            )}
            <button type="button" className="btn-review" onClick={close}>Fechar</button>
          </div>
        </div>

        {error && <p className="form-error" style={{ padding: "6px 24px" }}>{error}</p>}

        {conflicts.length > 0 && (
          <div className="conflict-strip">
            <p className="conflict-intro">
              {isOwner
                ? "a música mudou desde esta proposta — nos compassos abaixo, escolha qual versão fica. nada é resolvido automático."
                : "a música mudou desde a sua proposta — o dono vai escolher, compasso a compasso, qual versão fica. você também pode reenviar a trilha por cima da versão atual."}
            </p>
            <ul className="conflict-list">
              {conflicts.map((c) => (
                <li key={c.measureOrder} className="conflict-bar">
                  <div className="conflict-bar-label">compasso {c.bar}</div>
                  <div className="conflict-panes">
                    {(["current", "proposed"] as const).map((side) => {
                      const chosen = choices[c.measureOrder] === side;
                      const body = side === "current" ? c.current : c.proposed;
                      return (
                        <button
                          key={side}
                          type="button"
                          className={`conflict-pane${chosen ? " conflict-pane--chosen" : ""}`}
                          disabled={!isOwner}
                          onClick={() =>
                            setChoices((prev) => ({ ...prev, [c.measureOrder]: side }))
                          }
                        >
                          <span className="conflict-pane-tag">
                            {side === "current" ? "na música agora" : `proposta de ${open.authorName}`}
                            {chosen && " ✓"}
                          </span>
                          {body ? (
                            <TabSnippet
                              tex={conflictBarTex(body, c, detail?.trackHeader ?? null)}
                              isPercussion={detail?.isPercussion ?? false}
                              fallbackText={body}
                            />
                          ) : (
                            <pre className="conflict-pane-tex">(vazio)</pre>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="proposal-detail-player">
          {detail === null ? (
            <div className="player-loading">Preparando o diff…</div>
          ) : (
            <AlphaTabPlayer
              key={keyOf(open)}
              alphaTexUrl={`/api/songs/${songId}/assembled?track=${open.trackOrder}&author=${open.authorId}`}
              defaultTrackIndex={open.trackOrder}
              highlightBeats={detail.highlight}
              fullpage
            />
          )}
        </div>
      </div>
    );
  }

  // ── Lista ───────────────────────────────────────────────────────────────────
  return (
    <div className="proposals-panel">
      <p className="hist-intro">
        {isOwner
          ? "Propostas de mudança enviadas para esta música. Abra cada uma para ver as mudanças destacadas na partitura e aceite ou recuse."
          : "Suas propostas enviadas para esta música — aguardando a revisão do dono."}
      </p>

      {error && <p className="form-error">{error}</p>}
      {info && <p className="form-ok">{info}</p>}

      {!me && (
        <p className="proposals-empty">Identifique-se (topo da página) para ver suas propostas.</p>
      )}

      {me && visible.length === 0 && (
        <p className="proposals-empty">
          {isOwner
            ? "Nenhuma proposta pendente. Quando alguém propuser uma mudança numa faixa, ela aparece aqui."
            : "Você ainda não propôs mudanças. Vá em Colaborar → Editar uma faixa e clique em “Propor a trilha”."}
        </p>
      )}

      <ul className="proposals-list proposals-list--page">
        {visible.map((p) => (
          <li key={keyOf(p)} className="proposal-item proposal-item--page">
            <div className="proposal-meta">
              <div className="proposal-who">{p.authorName}</div>
              <div className="proposal-track">
                {p.trackName} · {p.count} compasso(s)
                {p.conflicts > 0 && (
                  <span className="conflict-count">
                    {" "}· {p.conflicts} conflito{p.conflicts === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              {!isOwner && (
                <div className="proposal-waiting">
                  aguardando {data.song.ownerName ?? "o dono"} revisar
                </div>
              )}
            </div>
            <div className="proposal-actions">
              <button type="button" className="btn-review" onClick={() => openProposal(p)}>
                Ver mudanças
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
