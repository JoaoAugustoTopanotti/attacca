"use client";

import { useState } from "react";
import Link from "next/link";
import UploadForm from "@/components/UploadForm";

export default function CollabPanel({
  songId,
  refreshRevisions,
}: {
  songId: string;
  refreshRevisions: (selectId?: string) => Promise<void>;
}) {
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <div className="collab-panel collab-panel--scroll">
      <p className="section-label">Como quer contribuir?</p>

      {/* Primary action — links to the track editor */}
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

      {/* Secondary action — collapsible upload */}
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
  );
}
