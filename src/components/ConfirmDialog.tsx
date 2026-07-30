"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// Confirmação destrutiva dentro do sistema visual do app, no lugar do
// window.confirm do navegador (fonte do sistema, sem tema, e o texto do
// título vem colado a "localhost:4000 diz"). Reusa a casca do auth-modal, a
// mesma da exclusão de música.
// Sem input de confirmação: aqui a ação é reversível o suficiente (dá para
// escrever de novo); digitar o nome fica só na exclusão da música inteira.
export default function ConfirmDialog({
  title,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Esc fecha e o foco começa em "Cancelar": a tecla e o foco padrão ficam do
  // lado seguro, como no confirm nativo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey, true);
    cancelRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prev;
    };
  }, [onCancel]);

  const body = (
    <div className="auth-overlay" onMouseDown={onCancel} role="presentation">
      <div
        className="auth-modal danger-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="auth-close"
          onClick={onCancel}
          aria-label="Fechar"
        >
          ✕
        </button>

        <h2 className="auth-title">{title}</h2>
        <div className="auth-sub">{children}</div>

        <div className="confirm-actions">
          <button
            type="button"
            className="confirm-cancel"
            onClick={onCancel}
            ref={cancelRef}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="danger-confirm"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
