"use client";

import { useState } from "react";
import AvisoCorteRegistros from "@/app/ingresos-egresos/AvisoCorteRegistros";
import type { Guardados } from "@/lib/ingresos-egresos/corte";

/* Los números de la base al 27/09/2026, con el corte de la migración 024. */
const GUARDADOS: Guardados = { movimientos: 799, ventasXRP: 18, pedidos: 6, entregas: 35 };
const CORTE = "2026-09-27T03:00:00+00:00";

/**
 * Admin: cambiar o quitar el corte lo refleja en el momento (en la app recarga la página). Con
 * ?fallar=1 guardar falla, para ver el mensaje de error.
 */
export default function PreviewCorteCliente() {
  const [corte, setCorte] = useState<string | null>(CORTE);

  return (
    <div style={{ fontFamily: "Arial, sans-serif", maxWidth: 1200, width: "100%", minWidth: 0, margin: "0 auto", padding: 20, color: "#1A1A2E", background: "white", minHeight: "100vh", boxSizing: "border-box" }}>
      <p style={{ background: "#FEF9E7", padding: "6px 10px", borderRadius: 6, fontSize: 12, margin: "0 0 12px" }}>
        Banco de pruebas del corte de registros. Nada se guarda.
      </p>

      <h2 style={{ fontSize: 14, margin: "0 0 8px" }}>Como admin</h2>
      <div data-test="caso-admin">
        <AvisoCorteRegistros
          corte={corte}
          guardados={corte ? GUARDADOS : { movimientos: 0, ventasXRP: 0, pedidos: 0, entregas: 0 }}
          esAdmin
          onCambiar={async (nuevo) => {
            await new Promise((r) => setTimeout(r, 80));
            if (new URLSearchParams(window.location.search).has("fallar")) return "No se pudo cambiar la fecha de corte. Probá de nuevo.";
            setCorte(nuevo);
            return null;
          }}
        />
        <p style={{ fontSize: 12, color: "#666" }} data-test="corte-actual">
          Corte guardado: {corte ?? "ninguno"}
        </p>
      </div>

      <h2 style={{ fontSize: 14, margin: "20px 0 8px" }}>Como usuario común</h2>
      <div data-test="caso-comun">
        <AvisoCorteRegistros corte={CORTE} guardados={GUARDADOS} esAdmin={false} onCambiar={async () => null} />
      </div>
    </div>
  );
}
