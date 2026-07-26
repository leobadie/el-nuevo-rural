"use client";

import { useMemo } from "react";
import { fmtMoneyIE } from "@/lib/ingresos-egresos/calculos";
import { thStyle, tdStyle } from "@/lib/ingresos-egresos/estilos";
import type { Movimiento } from "@/lib/ingresos-egresos/types";

export default function HistorialTab({ movs }: { movs: Movimiento[] }) {
  const historial = useMemo(
    () =>
      [...movs]
        .filter((m) => m.modificado_el)
        .sort((a, b) => new Date(b.modificado_el).getTime() - new Date(a.modificado_el).getTime())
        .slice(0, 150),
    [movs],
  );

  return (
    <div>
      <p style={{ fontSize: 11, color: "#888", marginBottom: 10 }}>
        Últimos movimientos creados o editados, del más reciente al más antiguo.
      </p>
      <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Fecha y hora</th>
              <th style={thStyle}>Acción</th>
              <th style={thStyle}>Descripción</th>
              <th style={thStyle}>Monto</th>
            </tr>
          </thead>
          <tbody>
            {historial.length === 0 && (
              <tr>
                <td colSpan={4} style={{ ...tdStyle, textAlign: "center", color: "#888", padding: 24 }}>
                  Todavía no hay actividad registrada.
                </td>
              </tr>
            )}
            {historial.map((m, i) => (
              <tr key={m.id} style={{ background: i % 2 === 1 ? "#F2F6FC" : "white", borderTop: "1px solid #eee" }}>
                <td style={tdStyle}>{new Date(m.modificado_el).toLocaleString("es-AR")}</td>
                <td style={tdStyle}>
                  <span
                    style={{
                      background: m.creado_el === m.modificado_el ? "#D5F5E3" : "#FDEBD0",
                      color: m.creado_el === m.modificado_el ? "#145A32" : "#784212",
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "3px 8px",
                      borderRadius: 10,
                    }}
                  >
                    {m.creado_el === m.modificado_el ? "Creado" : "Editado"}
                  </span>
                </td>
                <td style={tdStyle}>{m.descripcion || "-"}</td>
                <td style={{ ...tdStyle, fontWeight: 700 }}>{fmtMoneyIE(m.ingreso || m.egreso)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
