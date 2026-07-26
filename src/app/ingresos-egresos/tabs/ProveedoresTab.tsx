"use client";

import { useMemo } from "react";
import { buildResumenProveedorIE, fmtMoneyIE } from "@/lib/ingresos-egresos/calculos";
import { thStyle, tdStyle } from "@/lib/ingresos-egresos/estilos";
import type { Movimiento } from "@/lib/ingresos-egresos/types";

export default function ProveedoresTab({ movs }: { movs: Movimiento[] }) {
  const resumen = useMemo(() => buildResumenProveedorIE(movs), [movs]);

  return (
    <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle}>Proveedor</th>
            <th style={thStyle}>Cant. pagos</th>
            <th style={thStyle}>Total pagado</th>
          </tr>
        </thead>
        <tbody>
          {resumen.length === 0 && (
            <tr>
              <td colSpan={3} style={{ ...tdStyle, textAlign: "center", color: "#888", padding: 24 }}>
                Todavía no hay pagos a proveedores.
              </td>
            </tr>
          )}
          {resumen.map((p, i) => (
            <tr key={p.proveedor} style={{ background: i % 2 === 1 ? "#F2F6FC" : "white", borderTop: "1px solid #eee" }}>
              <td style={{ ...tdStyle, fontWeight: 700 }}>{p.proveedor}</td>
              <td style={tdStyle}>{p.cantidad}</td>
              <td style={tdStyle}>{fmtMoneyIE(p.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
