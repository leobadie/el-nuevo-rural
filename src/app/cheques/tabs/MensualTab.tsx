"use client";

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import { buildMonthlySummary, fmtMoney } from "@/lib/cheques/calculos";
import { NAVY, thStyle, tdStyle } from "@/lib/cheques/estilos";
import type { ChequeEnriquecido } from "@/lib/cheques/types";

export default function MensualTab({ enriched }: { enriched: ChequeEnriquecido[] }) {
  const monthlySummary = useMemo(() => buildMonthlySummary(enriched), [enriched]);

  return (
    <div>
      <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#1F3864", marginBottom: 8 }}>Emitido vs pagado por mes</div>
        {monthlySummary.length === 0 ? (
          <div style={{ fontSize: 12, color: "#888", padding: "30px 0", textAlign: "center" }}>Cargá cheques para ver la evolución mensual.</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthlySummary} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (v >= 1000000 ? `${Math.round(v / 1000000)}M` : v)} width={40} />
              <Tooltip formatter={(v) => fmtMoney(v as number)} labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="totalEmitido" name="Emitido" fill="#1F3864" radius={[4, 4, 0, 0]} />
              <Bar dataKey="totalPagado" name="Pagado" fill="#639922" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Mes</th>
              <th style={thStyle}>Cant. cheques</th>
              <th style={thStyle}>Total emitido</th>
              <th style={thStyle}>Total pagado</th>
              <th style={thStyle}>Total abierto</th>
            </tr>
          </thead>
          <tbody>
            {monthlySummary.length === 0 && (
              <tr>
                <td colSpan={5} style={{ ...tdStyle, textAlign: "center", color: "#888", padding: 24 }}>
                  Todavía no hay cheques cargados.
                </td>
              </tr>
            )}
            {monthlySummary.map((mo, i) => (
              <tr key={mo.key} style={{ background: i % 2 === 1 ? "#F2F6FC" : "white", borderTop: "1px solid #eee" }}>
                <td style={{ ...tdStyle, fontWeight: 700 }}>{mo.label}</td>
                <td style={tdStyle}>{mo.cantidad}</td>
                <td style={tdStyle}>{fmtMoney(mo.totalEmitido)}</td>
                <td style={tdStyle}>{fmtMoney(mo.totalPagado)}</td>
                <td style={{ ...tdStyle, fontWeight: 700, color: mo.totalAbierto > 0 ? "#784212" : "#1A1A2E" }}>{fmtMoney(mo.totalAbierto)}</td>
              </tr>
            ))}
          </tbody>
          {monthlySummary.length > 0 && (
            <tfoot>
              <tr style={{ background: NAVY, color: "white", fontWeight: 700 }}>
                <td style={{ ...tdStyle, color: "white" }}>TOTAL</td>
                <td style={{ ...tdStyle, color: "white" }}>{monthlySummary.reduce((s, mo) => s + mo.cantidad, 0)}</td>
                <td style={{ ...tdStyle, color: "white" }}>{fmtMoney(monthlySummary.reduce((s, mo) => s + mo.totalEmitido, 0))}</td>
                <td style={{ ...tdStyle, color: "white" }}>{fmtMoney(monthlySummary.reduce((s, mo) => s + mo.totalPagado, 0))}</td>
                <td style={{ ...tdStyle, color: "white" }}>{fmtMoney(monthlySummary.reduce((s, mo) => s + mo.totalAbierto, 0))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
