"use client";

import { useState } from "react";

interface ConfirmState {
  message: string;
  onConfirm: () => void;
}

export function useConfirmDialog() {
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  function pedirConfirmacion(message: string, onConfirm: () => void) {
    setConfirmState({ message, onConfirm });
  }

  function ConfirmModal() {
    if (!confirmState) return null;
    return (
      <div
        onClick={() => setConfirmState(null)}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: 16,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "white",
            borderRadius: 10,
            padding: 20,
            maxWidth: 360,
            width: "100%",
            boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
          }}
        >
          <p style={{ fontSize: 14, marginBottom: 18, color: "#1A1A2E", lineHeight: 1.4 }}>
            {confirmState.message}
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={() => setConfirmState(null)}
              style={{
                background: "white",
                color: "#333",
                border: "1px solid #ccc",
                borderRadius: 6,
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                const fn = confirmState.onConfirm;
                setConfirmState(null);
                fn();
              }}
              style={{
                background: "#C0392B",
                color: "white",
                border: "none",
                borderRadius: 6,
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Confirmar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return { pedirConfirmacion, ConfirmModal };
}
