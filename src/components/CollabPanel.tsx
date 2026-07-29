"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import UploadForm from "@/components/UploadForm";
import CompletenessPanel from "@/components/CompletenessPanel";

export default function CollabPanel({
  songId,
  refreshRevisions,
  materialized,
  onScaffolded,
}: {
  songId: string;
  refreshRevisions: (selectId?: string) => Promise<void>;
  materialized: boolean;
  onScaffolded: () => void;
}) {
  const router = useRouter();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [scaffolding, setScaffolding] = useState<"blank" | "attacca" | null>(null);
  const [scaffoldError, setScaffoldError] = useState<string | null>(null);

  async function scaffold(template: "blank" | "attacca") {
    setScaffolding(template);
    setScaffoldError(null);
    try {
      const res = await fetch(`/api/songs/${songId}/scaffold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Falha ao criar a grade.");
      onScaffolded();
      router.push(`/songs/${songId}/edit`);
    } catch (e) {
      setScaffoldError(e instanceof Error ? e.message : "Erro inesperado.");
      setScaffolding(null);
    }
  }

  // Música ainda sem grade: oferece os três jeitos de começar lado a lado.
  // "Editar uma faixa" só faz sentido depois que a grade existe.
  if (!materialized) {
    return (
      <div className="collab-panel">
        <div className="collab-main no-scrollbar">
          <div className="collab-actions">
            <p className="section-label">Como quer começar?</p>

            <button
              type="button"
              className="action-card action-card--primary"
              onClick={() => scaffold("blank")}
              disabled={scaffolding !== null}
            >
              <div className="action-body">
                <div className="action-title">Criar do zero</div>
                <div className="action-desc">
                  Abre o editor visual com uma trilha de guitarra em branco,
                  pronta pra você tablaturar.
                </div>
              </div>
              <span className="action-arrow">{scaffolding === "blank" ? "…" : "→"}</span>
            </button>

            <button
              type="button"
              className="action-card"
              onClick={() => scaffold("attacca")}
              disabled={scaffolding !== null}
            >
              <div className="action-body">
                <div className="action-title">Usar o template do attacca</div>
                <div className="action-desc">
                  Começa com guitarra + baixo de exemplo já preenchidos, pra
                  você editar em cima.
                </div>
              </div>
              <span className="action-arrow">{scaffolding === "attacca" ? "…" : "→"}</span>
            </button>

            <button
              type="button"
              className={`action-card action-card--toggle${uploadOpen ? " open" : ""}`}
              onClick={() => setUploadOpen((p) => !p)}
              disabled={scaffolding !== null}
            >
              <div className="action-body">
                <div className="action-title">Enviar arquivo completo</div>
                <div className="action-desc">
                  Já tem a partitura pronta? Upload de um arquivo Guitar Pro.
                </div>
              </div>
              <span className="action-arrow">{uploadOpen ? "▴" : "▾"}</span>
            </button>

            {uploadOpen && (
              <div className="action-upload-area">
                <UploadForm
                  songId={songId}
                  onUploaded={(id) => {
                    refreshRevisions(id);
                    onScaffolded();
                    setUploadOpen(false);
                  }}
                />
              </div>
            )}

            {scaffoldError && <div className="form-error">{scaffoldError}</div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="collab-panel">
      {/* Conteúdo principal: largura total, rola sem barra visível */}
      <div className="collab-main no-scrollbar">
        <div className="collab-actions">
          <p className="section-label">Como quer contribuir?</p>

          <Link
            href={`/songs/${songId}/edit`}
            className="action-card action-card--primary"
          >
            <div className="action-body">
              <div className="action-title">Editar uma faixa</div>
              <div className="action-desc">
                Escolha uma faixa (guitarra, baixo, bateria…) e edite o conteúdo
                dela. Sua versão fica pendente — o dono revisa antes de aceitar.
              </div>
            </div>
            <span className="action-arrow">→</span>
          </Link>

          <button
            type="button"
            className={`action-card action-card--toggle${uploadOpen ? " open" : ""}`}
            onClick={() => setUploadOpen((p) => !p)}
          >
            <div className="action-body">
              <div className="action-title">Enviar arquivo completo</div>
              <div className="action-desc">
                Upload de um arquivo Guitar Pro com sua versão da música inteira
              </div>
            </div>
            <span className="action-arrow">{uploadOpen ? "▴" : "▾"}</span>
          </button>

          {uploadOpen && (
            <div className="action-upload-area">
              <UploadForm
                songId={songId}
                onUploaded={(id) => {
                  refreshRevisions(id);
                  setUploadOpen(false);
                }}
              />
            </div>
          )}

          <p className="collab-note">
            <strong>Dica:</strong> &quot;Editar uma faixa&quot; é o jeito
            recomendado para contribuir com seu instrumento. O upload de arquivo
            completo é útil quando você já tem a partitura pronta num arquivo
            Guitar Pro.
          </p>
        </div>
      </div>

      {/* Completude recolhível no rodapé */}
      <CompletenessPanel songId={songId} />
    </div>
  );
}
