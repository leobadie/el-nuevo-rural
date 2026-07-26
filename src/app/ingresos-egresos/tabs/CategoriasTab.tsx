"use client";

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { buildResumenCategoria, fmtMoneyIE } from "@/lib/ingresos-egresos/calculos";
import { RED, thStyle, tdStyle } from "@/lib/ingresos-egresos/estilos";
import type { Movimiento } from "@/lib/ingresos-egresos/types";

export default function CategoriasTab({
  movs,
  nombresCategorias,
  limites,
  onSetLimite,
}: {
  movs: Movimiento[];
  nombresCategorias: string[];
  limites: Record<string, number>;
  onSetLimite: (categoria: string, valor: string) => void;
}) {
  const resumen = useMemo(() => buildResumenCategoria(movs, nombresCategorias), [movs, nombresCategorias]);
  const enRiesgo = useMemo(
    () => resumen.filter((c) => limites[c.categoria] && c.egresos > limites[c.categoria]).length,
    [resumen, limites],
  );

  return (
    <div>
      {enRiesgo > 0 && (
        <div style={{ background: "#FADBD8", color: "#922B21", padding: "10px 14px", borderRadius: 8, marginBottom: 16, display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
          <AlertTriangle size={16} />
          {enRiesgo} categoría(s) superan el límite mensual que definiste.
        </div>
      )}
      <p style={{ fontSize: 11, color: "#888", marginBottom: 10 }}>
        Poné un límite mensual de egresos por categoría (opcional). Si lo supera, la fila se resalta en rojo.
      </p>
      <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Categoría</th>
              <th style={thStyle}>Ingresos</th>
              <th style={thStyle}>Egresos</th>
              <th style={thStyle}>Límite mensual</th>
            </tr>
          </thead>
          <tbody>
            {resumen.length === 0 && (
              <tr>
                <td colSpan={4} style={{ ...tdStyle, textAlign: "center", color: "#888", padding: 24 }}>
                  Todavía no hay movimientos cargados.
                </td>
              </tr>
            )}
            {resumen.map((c, i) => {
              const limite = limites[c.categoria];
              const superado = limite && c.egresos > limite;
              return (
                <tr key={c.categoria} style={{ background: superado ? "#FADBD8" : i % 2 === 1 ? "#F2F6FC" : "white", borderTop: "1px solid #eee" }}>
                  <td style={{ ...tdStyle, fontWeight: 700, color: superado ? "#922B21" : "#1A1A2E" }}>
                    {superado && <AlertTriangle size={12} style={{ marginRight: 4, verticalAlign: "-2px" }} />}
                    {c.categoria}
                  </td>
                  <td style={tdStyle}>{fmtMoneyIE(c.ingresos)}</td>
                  <td style={{ ...tdStyle, fontWeight: 700, color: superado ? "#922B21" : c.egresos > 0 ? "#8C0000" : "#1A1A2E" }}>
                    {fmtMoneyIE(c.egresos)}
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      placeholder="Sin límite"
                      defaultValue={limite || ""}
                      onBlur={(e) => onSetLimite(c.categoria, e.target.value)}
                      style={{ width: 110, padding: "5px 7px", borderRadius: 6, border: "1px solid #ccc", fontSize: 12, color: "#1A1A2E", background: "white" }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          {resumen.length > 0 && (
            <tfoot>
              <tr style={{ background: RED, color: "white", fontWeight: 700 }}>
                <td style={{ ...tdStyle, color: "white" }}>TOTAL</td>
                <td style={{ ...tdStyle, color: "white" }}>{fmtMoneyIE(resumen.reduce((s, c) => s + c.ingresos, 0))}</td>
                <td style={{ ...tdStyle, color: "white" }}>{fmtMoneyIE(resumen.reduce((s, c) => s + c.egresos, 0))}</td>
                <td style={{ ...tdStyle, color: "white" }}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
