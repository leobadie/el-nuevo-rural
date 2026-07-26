"use client";

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { buildProviderSummary, fmtMoney } from "@/lib/cheques/calculos";
import { NAVY, thStyle, tdStyle } from "@/lib/cheques/estilos";
import type { ChequeEnriquecido } from "@/lib/cheques/types";

export default function ProveedoresTab({
  enriched,
  limites,
  onSetLimite,
}: {
  enriched: ChequeEnriquecido[];
  limites: Record<string, number>;
  onSetLimite: (proveedor: string, valor: string) => void;
}) {
  const providerSummary = useMemo(() => buildProviderSummary(enriched), [enriched]);
  const proveedoresEnRiesgo = useMemo(
    () => providerSummary.filter((p) => limites[p.proveedor] && p.totalAbierto > limites[p.proveedor]).length,
    [providerSummary, limites],
  );

  return (
    <div>
      {proveedoresEnRiesgo > 0 && (
        <div style={{ background: "#FADBD8", color: "#922B21", padding: "10px 14px", borderRadius: 8, marginBottom: 16, display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
          <AlertTriangle size={16} />
          {proveedoresEnRiesgo} proveedor(es) superan el límite de exposición que definiste.
        </div>
      )}
      <p style={{ fontSize: 11, color: "#888", marginBottom: 10 }}>
        Poné un límite de exposición abierta por proveedor (opcional). Si lo supera, la fila se resalta en rojo. Dejá en blanco para no controlar ese proveedor.
      </p>
      <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Proveedor</th>
              <th style={thStyle}>Cant. cheques</th>
              <th style={thStyle}>Total emitido</th>
              <th style={thStyle}>Total pagado</th>
              <th style={thStyle}>Total abierto</th>
              <th style={thStyle}>Límite</th>
            </tr>
          </thead>
          <tbody>
            {providerSummary.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "#888", padding: 24 }}>
                  Todavía no hay cheques cargados.
                </td>
              </tr>
            )}
            {providerSummary.map((p, i) => {
              const limite = limites[p.proveedor];
              const superado = limite && p.totalAbierto > limite;
              return (
                <tr key={p.proveedor} style={{ background: superado ? "#FADBD8" : i % 2 === 1 ? "#F2F6FC" : "white", borderTop: "1px solid #eee" }}>
                  <td style={{ ...tdStyle, fontWeight: 700, color: superado ? "#922B21" : "#1A1A2E" }}>
                    {superado && <AlertTriangle size={12} style={{ marginRight: 4, verticalAlign: "-2px" }} />}
                    {p.proveedor}
                  </td>
                  <td style={tdStyle}>{p.cantidad}</td>
                  <td style={tdStyle}>{fmtMoney(p.totalEmitido)}</td>
                  <td style={tdStyle}>{fmtMoney(p.totalPagado)}</td>
                  <td style={{ ...tdStyle, fontWeight: 700, color: superado ? "#922B21" : p.totalAbierto > 0 ? "#784212" : "#1A1A2E" }}>
                    {fmtMoney(p.totalAbierto)}
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      placeholder="Sin límite"
                      defaultValue={limite || ""}
                      onBlur={(e) => onSetLimite(p.proveedor, e.target.value)}
                      style={{ width: 110, padding: "5px 7px", borderRadius: 6, border: "1px solid #ccc", fontSize: 12, color: "#1A1A2E", background: "white" }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          {providerSummary.length > 0 && (
            <tfoot>
              <tr style={{ background: NAVY, color: "white", fontWeight: 700 }}>
                <td style={{ ...tdStyle, color: "white" }}>TOTAL</td>
                <td style={{ ...tdStyle, color: "white" }}>{providerSummary.reduce((s, p) => s + p.cantidad, 0)}</td>
                <td style={{ ...tdStyle, color: "white" }}>{fmtMoney(providerSummary.reduce((s, p) => s + p.totalEmitido, 0))}</td>
                <td style={{ ...tdStyle, color: "white" }}>{fmtMoney(providerSummary.reduce((s, p) => s + p.totalPagado, 0))}</td>
                <td style={{ ...tdStyle, color: "white" }}>{fmtMoney(providerSummary.reduce((s, p) => s + p.totalAbierto, 0))}</td>
                <td style={{ ...tdStyle, color: "white" }}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
