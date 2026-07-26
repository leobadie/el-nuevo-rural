"use client";

import { useMemo } from "react";
import { buildAging, fmtDate, fmtMoney } from "@/lib/cheques/calculos";
import { ESTADO_STYLES, NAVY, thStyle, tdStyle } from "@/lib/cheques/estilos";
import type { ChequeEnriquecido } from "@/lib/cheques/types";

const BAND_COLORS = ["#FDEBD0", "#FADBD8", "#F5B7B1", "#E6B0AA"];
const BAND_TEXT = ["#784212", "#922B21", "#7B241C", "#641E16"];

export default function AntiguedadTab({ enriched }: { enriched: ChequeEnriquecido[] }) {
  const aging = useMemo(() => buildAging(enriched), [enriched]);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 20 }}>
        {aging.bands.map((b, i) => (
          <div key={b.label} style={{ background: BAND_COLORS[i], color: BAND_TEXT[i], borderRadius: 8, padding: "12px 10px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>{b.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtMoney(b.monto)}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 8 }}>Detalle de cheques vencidos y rechazados</div>
      <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>N° Cheque</th>
              <th style={thStyle}>Proveedor</th>
              <th style={thStyle}>F. Cobro</th>
              <th style={thStyle}>Importe</th>
              <th style={thStyle}>Estado</th>
              <th style={thStyle}>Días de atraso</th>
            </tr>
          </thead>
          <tbody>
            {aging.detail.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "#888", padding: 24 }}>
                  No hay cheques vencidos ni rechazados. 🎉
                </td>
              </tr>
            )}
            {aging.detail.map((c) => {
              const style = ESTADO_STYLES[c.estado] || ESTADO_STYLES.Pendiente;
              return (
                <tr key={c.id} style={{ background: style.bg, borderTop: "1px solid #eee" }}>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{c.n_cheque || "-"}</td>
                  <td style={tdStyle}>{c.proveedor}</td>
                  <td style={tdStyle}>{fmtDate(c.fecha_cobro)}</td>
                  <td style={tdStyle}>{fmtMoney(c.importe)}</td>
                  <td style={tdStyle}>
                    <span style={{ background: style.bg, color: style.text, fontWeight: 700, fontSize: 11, padding: "3px 8px", borderRadius: 10, border: `1px solid ${style.text}33` }}>
                      {style.label}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{c.diasAtraso}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
