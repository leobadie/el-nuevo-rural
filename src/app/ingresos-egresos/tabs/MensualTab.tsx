"use client";

import { useMemo } from "react";
import { buildResumenMensualIE, fmtMoneyIE } from "@/lib/ingresos-egresos/calculos";
import { RED, thStyle, tdStyle } from "@/lib/ingresos-egresos/estilos";
import type { Movimiento } from "@/lib/ingresos-egresos/types";

export default function MensualTab({ movs, nombresCategorias }: { movs: Movimiento[]; nombresCategorias: string[] }) {
  const resumenMensual = useMemo(() => buildResumenMensualIE(movs), [movs]);

  const comparacion = useMemo(() => {
    if (resumenMensual.length < 1) return null;
    const mesActual = resumenMensual[resumenMensual.length - 1];
    const mesAnterior = resumenMensual.length >= 2 ? resumenMensual[resumenMensual.length - 2] : null;
    if (!mesAnterior) return null;

    const categoriasSet = new Set(nombresCategorias);
    movs.forEach((m) => {
      if (m.categoria) categoriasSet.add(m.categoria);
    });

    const sumaEgresos = (mesKey: string, categoria: string) =>
      movs
        .filter((m) => m.fecha?.startsWith(mesKey) && (m.categoria || "(sin categoría)") === categoria)
        .reduce((s, m) => s + (Number(m.egreso) || 0), 0);

    const filas = Array.from(categoriasSet)
      .map((categoria) => ({
        categoria,
        actual: sumaEgresos(mesActual.key, categoria),
        anterior: sumaEgresos(mesAnterior.key, categoria),
      }))
      .filter((f) => f.actual > 0 || f.anterior > 0);

    return { mesActual, mesAnterior, filas };
  }, [movs, nombresCategorias, resumenMensual]);

  return (
    <div>
      <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8, marginBottom: 20 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Mes</th>
              <th style={thStyle}>Ingresos</th>
              <th style={thStyle}>Egresos</th>
              <th style={thStyle}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {resumenMensual.length === 0 && (
              <tr>
                <td colSpan={4} style={{ ...tdStyle, textAlign: "center", color: "#888", padding: 24 }}>
                  Todavía no hay movimientos cargados.
                </td>
              </tr>
            )}
            {resumenMensual.map((mo, i) => (
              <tr key={mo.key} style={{ background: i % 2 === 1 ? "#F2F6FC" : "white", borderTop: "1px solid #eee" }}>
                <td style={{ ...tdStyle, fontWeight: 700 }}>{mo.label}</td>
                <td style={tdStyle}>{fmtMoneyIE(mo.ingresos)}</td>
                <td style={tdStyle}>{fmtMoneyIE(mo.egresos)}</td>
                <td style={{ ...tdStyle, fontWeight: 700, color: mo.ingresos - mo.egresos >= 0 ? "#1E7B34" : "#8C0000" }}>
                  {fmtMoneyIE(mo.ingresos - mo.egresos)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {comparacion && comparacion.filas.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: RED, marginBottom: 8 }}>
            {comparacion.mesActual.label} vs {comparacion.mesAnterior.label}
          </div>
          <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Categoría</th>
                  <th style={thStyle}>{comparacion.mesAnterior.label}</th>
                  <th style={thStyle}>{comparacion.mesActual.label}</th>
                  <th style={thStyle}>Variación</th>
                </tr>
              </thead>
              <tbody>
                {comparacion.filas.map((f, i) => {
                  const variacion = f.anterior === 0 ? (f.actual > 0 ? 100 : 0) : Math.round(((f.actual - f.anterior) / f.anterior) * 100);
                  const subio = variacion > 0;
                  return (
                    <tr key={f.categoria} style={{ background: i % 2 === 1 ? "#F2F6FC" : "white", borderTop: "1px solid #eee" }}>
                      <td style={{ ...tdStyle, fontWeight: 700 }}>{f.categoria}</td>
                      <td style={tdStyle}>{fmtMoneyIE(f.anterior)}</td>
                      <td style={tdStyle}>{fmtMoneyIE(f.actual)}</td>
                      <td style={{ ...tdStyle, fontWeight: 700, color: subio ? "#922B21" : "#145A32" }}>
                        {variacion !== 0 && (subio ? "▲ " : "▼ ")}
                        {Math.abs(variacion)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
