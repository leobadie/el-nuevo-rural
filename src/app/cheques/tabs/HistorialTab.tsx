"use client";

import { useMemo } from "react";
import { fmtMoney } from "@/lib/cheques/calculos";
import { thStyle, tdStyle } from "@/lib/cheques/estilos";
import type { ChequeEnriquecido } from "@/lib/cheques/types";

export default function HistorialTab({ enriched }: { enriched: ChequeEnriquecido[] }) {
  const historial = useMemo(
    () =>
      [...enriched]
        .filter((c) => c.modificado_el)
        .sort((a, b) => new Date(b.modificado_el).getTime() - new Date(a.modificado_el).getTime())
        .slice(0, 150),
    [enriched],
  );

  return (
    <div>
      <p style={{ fontSize: 11, color: "#888", marginBottom: 10 }}>
        Últimos cheques creados o editados, del más reciente al más antiguo.
      </p>
      <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Fecha y hora</th>
              <th style={thStyle}>Acción</th>
              <th style={thStyle}>N° Cheque</th>
              <th style={thStyle}>Proveedor</th>
              <th style={thStyle}>Importe</th>
            </tr>
          </thead>
          <tbody>
            {historial.length === 0 && (
              <tr>
                <td colSpan={5} style={{ ...tdStyle, textAlign: "center", color: "#888", padding: 24 }}>
                  Todavía no hay actividad registrada.
                </td>
              </tr>
            )}
            {historial.map((c, i) => (
              <tr key={c.id} style={{ background: i % 2 === 1 ? "#F2F6FC" : "white", borderTop: "1px solid #eee" }}>
                <td style={tdStyle}>{c.modificado_el ? new Date(c.modificado_el).toLocaleString("es-AR") : "-"}</td>
                <td style={tdStyle}>
                  <span
                    style={{
                      background: c.creado_el === c.modificado_el ? "#D5F5E3" : "#FDEBD0",
                      color: c.creado_el === c.modificado_el ? "#145A32" : "#784212",
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "3px 8px",
                      borderRadius: 10,
                    }}
                  >
                    {c.creado_el === c.modificado_el ? "Creado" : "Editado"}
                  </span>
                </td>
                <td style={{ ...tdStyle, fontWeight: 700 }}>{c.n_cheque || "-"}</td>
                <td style={tdStyle}>{c.proveedor}</td>
                <td style={tdStyle}>{fmtMoney(c.importe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
