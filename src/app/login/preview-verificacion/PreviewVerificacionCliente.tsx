"use client";

import { useState } from "react";
import VerificacionTab from "@/app/cheques/tabs/VerificacionTab";

/*
 * Banco de pruebas de la pestaña Verificación. A diferencia del calendario, acá no hay datos
 * ficticios: las consultas van contra la API real del BCRA. El botón de abajo simula lo que
 * hace "Verificar" desde Cheques de Terceros (montar la pestaña con un CUIT ya cargado).
 * El CUIT usado es el de YPF, que es información pública.
 */
const CUIT_DE_PRUEBA = "30546689979";

export default function PreviewVerificacionCliente() {
  const [cuitInicial, setCuitInicial] = useState("");

  return (
    <div style={{ fontFamily: "Arial, sans-serif", maxWidth: 1200, margin: "0 auto", padding: 20, background: "white", color: "#1A1A2E" }}>
      <button
        data-testid="btn-simular-verificar-librador"
        onClick={() => setCuitInicial(CUIT_DE_PRUEBA)}
        style={{ marginBottom: 16, border: "1px solid #1F3864", background: "white", color: "#1F3864", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
      >
        Simular &quot;Verificar librador&quot; con un CUIT precargado
      </button>
      <VerificacionTab key={cuitInicial} cuitInicial={cuitInicial} />
    </div>
  );
}
