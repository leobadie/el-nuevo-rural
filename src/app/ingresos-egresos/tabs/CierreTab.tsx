"use client";

import { useMemo } from "react";
import { fmtMoneyIE } from "@/lib/ingresos-egresos/calculos";
import { thStyle, tdStyle } from "@/lib/ingresos-egresos/estilos";
import type { Movimiento } from "@/lib/ingresos-egresos/types";

export default function CierreTab({ movs }: { movs: Movimiento[] }) {
  const hoy = new Date().toISOString().slice(0, 10);

  const cierre = useMemo(() => {
    const movsHoy = movs.filter((m) => m.fecha === hoy);
    const movsCaja = movsHoy.filter((m) => m.medio_pago !== "Cheque");
    const ingresos = movsCaja.reduce((s, m) => s + (Number(m.ingreso) || 0), 0);
    const egresos = movsCaja.reduce((s, m) => s + (Number(m.egreso) || 0), 0);
    const pagadoConCheque = movsHoy
      .filter((m) => m.medio_pago === "Cheque")
      .reduce((s, m) => s + (Number(m.egreso) || 0), 0);
    return { movsCaja, ingresos, egresos, neto: ingresos - egresos, pagadoConCheque };
  }, [movs, hoy]);

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A2E", marginBottom: 16 }}>
        Cierre de caja — {new Date(hoy + "T00:00:00").toLocaleDateString("es-AR")}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 16 }}>
        <div style={{ background: "#EAFAF1", color: "#1E7B34", borderRadius: 8, padding: "12px 10px" }}>
          <div style={{ fontSize: 10, fontWeight: 700 }}>ENTRÓ HOY</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtMoneyIE(cierre.ingresos)}</div>
        </div>
        <div style={{ background: "#FDEDEC", color: "#8C0000", borderRadius: 8, padding: "12px 10px" }}>
          <div style={{ fontSize: 10, fontWeight: 700 }}>SALIÓ HOY</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtMoneyIE(cierre.egresos)}</div>
        </div>
        <div style={{ background: "#EBF2FA", color: "#1F4E78", borderRadius: 8, padding: "12px 10px" }}>
          <div style={{ fontSize: 10, fontWeight: 700 }}>NETO DEL DÍA</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtMoneyIE(cierre.neto)}</div>
        </div>
      </div>

      {cierre.pagadoConCheque > 0 && (
        <div style={{ background: "#E6F1FB", color: "#0C447C", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 12 }}>
          Además, hoy se pagaron {fmtMoneyIE(cierre.pagadoConCheque)} con cheque — ese monto no sale de la caja hasta que se cobre.
        </div>
      )}

      <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Descripción</th>
              <th style={thStyle}>Categoría</th>
              <th style={thStyle}>Ingreso</th>
              <th style={thStyle}>Egreso</th>
            </tr>
          </thead>
          <tbody>
            {cierre.movsCaja.length === 0 && (
              <tr>
                <td colSpan={4} style={{ ...tdStyle, textAlign: "center", color: "#888", padding: 24 }}>
                  Todavía no hay movimientos de hoy.
                </td>
              </tr>
            )}
            {cierre.movsCaja.map((m, i) => (
              <tr key={m.id} style={{ background: i % 2 === 1 ? "#F2F6FC" : "white", borderTop: "1px solid #eee" }}>
                <td style={tdStyle}>{m.descripcion || "-"}</td>
                <td style={tdStyle}>{m.categoria || "-"}</td>
                <td style={tdStyle}>{m.ingreso ? fmtMoneyIE(m.ingreso) : "-"}</td>
                <td style={tdStyle}>{m.egreso ? fmtMoneyIE(m.egreso) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
