"use client";

import type { RevisionDTO } from "@/lib/song-types";

function formatDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(
    d.getMinutes()
  )}`;
}

export default function HistoryPanel({
  revisions,
  revertTo,
  canRevert,
  view,
  onView,
}: {
  revisions: RevisionDTO[];
  revertTo: (id: string) => Promise<void>;
  /** Só o dono reverte (o Histórico em si é visível a todos). */
  canRevert: boolean;
  /** Versão atualmente carregada no player ("live" = versão viva). */
  view: string;
  /** Pede ao player principal para tocar esta versão (e vai para a aba Player). */
  onView: (id: string) => void;
}) {
  if (revisions.length === 0) {
    return (
      <div className="hist-panel hist-panel--scroll">
        <p className="sub">Nenhuma versão ainda.</p>
      </div>
    );
  }

  const latestNum = Math.max(...revisions.map((r) => r.number));

  function handleRevert(r: RevisionDTO) {
    if (
      window.confirm(
        `Reverter para a revisão #${r.number}? Isso cria uma NOVA revisão a partir dela (o histórico é preservado).`
      )
    ) {
      revertTo(r.id);
    }
  }

  return (
    <div className="hist-panel hist-panel--scroll">
      <p className="hist-intro">
        Versões da transcrição em ordem cronológica. Clique em{" "}
        <strong>Ouvir</strong> para carregar qualquer versão no player — lá dá para
        voltar à versão atual quando quiser.
      </p>

      <ul className="rev-timeline">
        {revisions.map((r) => {
          const isCurrent = r.number === latestNum;
          const isViewing = view === r.id;

          return (
            <li
              key={r.id}
              className={`rev-item${isViewing ? " rev-item--open" : ""}`}
            >
              <div className={`rev-dot${isCurrent ? " current" : ""}`} />
              <div className="rev-body">
                <div className="rev-head">
                  <span className="rev-num">#{r.number}</span>
                  {isCurrent && <span className="tag tag-current">atual</span>}
                  <span className="tag tag-fmt">
                    {r.kind === "snapshot" ? "mudança" : r.format}
                  </span>
                  {isViewing && !isCurrent && (
                    <span className="tag tag-current">no player</span>
                  )}
                </div>
                <div className="rev-meta">
                  {r.authorName} · {formatDate(r.createdAt)}
                </div>
                {r.message && (
                  <div className="rev-msg">&ldquo;{r.message}&rdquo;</div>
                )}
              </div>
              <div className="rev-actions">
                {isCurrent ? (
                  <button
                    type="button"
                    className="rev-btn"
                    onClick={() => onView("live")}
                    title="Tocar a versão atual"
                  >
                    Ouvir
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`rev-btn${isViewing ? " active" : ""}`}
                    onClick={() => onView(r.id)}
                  >
                    Ouvir
                  </button>
                )}
                {canRevert && !isCurrent && r.kind !== "snapshot" && (
                  <button
                    type="button"
                    className="rev-btn"
                    onClick={() => handleRevert(r)}
                    title={`Reverter para #${r.number}`}
                  >
                    ⟲
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
