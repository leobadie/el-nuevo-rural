"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid,
} from "recharts";
import { fmtMoney } from "@/lib/cheques/calculos";
import { buildEvolucion, buildGastosPorCategoria, calcularMes } from "@/lib/rentabilidad/calculos";
import { PURPLE, RENT_PIE_COLORS, thStyle, tdStyle } from "@/lib/rentabilidad/estilos";
import type { Colaborador, ParametrosEmpleados, RegistroAsistencia } from "@/lib/empleados/types";
import type { Movimiento, VentaXRP } from "@/lib/ingresos-egresos/types";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export default function RentabilidadShell({
  movimientos,
  ventasXRP,
  colaboradores,
  registros,
  parametros,
}: {
  movimientos: Movimiento[];
  ventasXRP: VentaXRP[];
  colaboradores: Colaborador[];
  registros: RegistroAsistencia[];
  parametros: ParametrosEmpleados;
}) {
  const [tab, setTab] = useState("resumen");
  const hoy = new Date();
  const [mesSel, setMesSel] = useState({ anio: hoy.getFullYear(), mes: hoy.getMonth() + 1 });

  const datosMes = useMemo(
    () => calcularMes(movimientos, ventasXRP, colaboradores, registros, parametros, mesSel.anio, mesSel.mes),
    [movimientos, ventasXRP, colaboradores, registros, parametros, mesSel],
  );
  const gastosPorCategoria = useMemo(() => buildGastosPorCategoria(datosMes), [datosMes]);
  const totalGasto = datosMes.egresosOperativos + datosMes.costoPersonal;

  const evolucion = useMemo(
    () => buildEvolucion(movimientos, ventasXRP, colaboradores, registros, parametros),
    [movimientos, ventasXRP, colaboradores, registros, parametros],
  );

  return (
    <div style={{ fontFamily: "Arial, sans-serif", maxWidth: 1200, margin: "0 auto", padding: 20, color: "#1A1A2E", background: "white", minHeight: "100vh" }}>
      <div
        style={{
          background: PURPLE,
          color: "white",
          padding: "18px 24px",
          borderRadius: 10,
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div style={{ width: 50, height: 50, borderRadius: 12, flexShrink: 0, overflow: "hidden", boxShadow: "0 2px 6px rgba(0,0,0,0.25)" }}>
          <Image src="/logo.jpg" alt="Logo El Nuevo Rural" width={50} height={50} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: 0.3 }}>EL NUEVO RURAL</h1>
          <p style={{ margin: "2px 0 0", fontSize: 13, opacity: 0.85 }}>Rentabilidad</p>
        </div>
        <Link href="/cheques" style={{ color: "white", fontSize: 13, fontWeight: 700, opacity: 0.9 }}>
          Cheques
        </Link>
        <Link href="/ingresos-egresos" style={{ color: "white", fontSize: 13, fontWeight: 700, opacity: 0.9 }}>
          Ingresos y Egresos
        </Link>
        <Link href="/empleados" style={{ color: "white", fontSize: 13, fontWeight: 700, opacity: 0.9 }}>
          Empleados
        </Link>
        <Link href="/" style={{ color: "white", fontSize: 13, fontWeight: 700, opacity: 0.9 }}>
          ← Volver
        </Link>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16, borderBottom: "1px solid #ddd" }}>
        {[
          ["resumen", "Resumen del mes"],
          ["evolucion", "Evolución"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              border: "none",
              background: "transparent",
              padding: "10px 14px",
              fontSize: 13,
              fontWeight: 700,
              color: tab === key ? PURPLE : "#888",
              borderBottom: tab === key ? `2px solid ${PURPLE}` : "2px solid transparent",
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "resumen" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: "#666", maxWidth: 560 }}>
              Combina las ventas reales importadas de XRP (o cargadas a mano como &quot;Otro Ingreso&quot;) con los gastos
              operativos y el costo de personal, para mostrar la utilidad real del negocio.
            </p>
            <Link
              href="/ingresos-egresos?tab=ventasxrp"
              style={{ background: "#25D366", color: "white", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}
            >
              Cargar ventas de hoy →
            </Link>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <select
              value={mesSel.mes}
              onChange={(e) => setMesSel({ ...mesSel, mes: parseInt(e.target.value, 10) })}
              style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #ccc", fontSize: 13, color: "#1A1A2E", background: "white" }}
            >
              {MESES.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
            <input
              type="number"
              value={mesSel.anio}
              onChange={(e) => setMesSel({ ...mesSel, anio: parseInt(e.target.value, 10) || hoy.getFullYear() })}
              style={{ width: 90, padding: "6px 8px", borderRadius: 6, border: "1px solid #ccc", fontSize: 13, color: "#1A1A2E", background: "white" }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 16 }}>
            <div style={{ background: "#1E7B34", color: "white", borderRadius: 8, padding: "12px 10px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.9 }}>INGRESOS REALES</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtMoney(datosMes.ingresosReales)}</div>
            </div>
            <div style={{ background: "#8C0000", color: "white", borderRadius: 8, padding: "12px 10px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.9 }}>GASTOS OPERATIVOS</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtMoney(datosMes.egresosOperativos)}</div>
            </div>
            <div style={{ background: "#1F4E78", color: "white", borderRadius: 8, padding: "12px 10px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.9 }}>COSTO DE PERSONAL</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtMoney(datosMes.costoPersonal)}</div>
            </div>
            <div style={{ background: datosMes.utilidad >= 0 ? PURPLE : "#922B21", color: "white", borderRadius: 8, padding: "12px 10px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.9 }}>UTILIDAD NETA ({datosMes.margen.toFixed(1)}%)</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtMoney(datosMes.utilidad)}</div>
            </div>
          </div>

          {datosMes.retiroCaja > 0 && (
            <div style={{ background: "#FDEBD0", color: "#784212", padding: "10px 14px", borderRadius: 8, marginBottom: 10, fontSize: 12 }}>
              ℹ️ Además hubo {fmtMoney(datosMes.retiroCaja)} en &quot;Retiro de Caja&quot; este mes — no se cuenta como ingreso real, es solo movimiento de efectivo.
            </div>
          )}
          {datosMes.cobroCliente > 0 && (
            <div style={{ background: "#FDEBD0", color: "#784212", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 12 }}>
              ℹ️ Además cobraste {fmtMoney(datosMes.cobroCliente)} de cuentas corrientes este mes — no se cuenta de nuevo
              como ingreso, porque esa venta ya se contabilizó el día que se hizo (cuenta corriente).
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 14 }}>
            <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: PURPLE, marginBottom: 8 }}>Desglose de gastos</div>
              {gastosPorCategoria.length === 0 ? (
                <div style={{ fontSize: 12, color: "#888", padding: "30px 0", textAlign: "center" }}>Sin gastos este mes.</div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={gastosPorCategoria} dataKey="total" nameKey="categoria" cx="50%" cy="50%" outerRadius={80} label={(entry) => entry.name} labelLine={false} style={{ fontSize: 10 }}>
                      {gastosPorCategoria.map((entry, i) => (
                        <Cell key={i} fill={RENT_PIE_COLORS[i % RENT_PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => fmtMoney(v as number)} contentStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8, alignSelf: "start" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Categoría</th>
                    <th style={thStyle}>Monto</th>
                    <th style={thStyle}>% del gasto</th>
                  </tr>
                </thead>
                <tbody>
                  {gastosPorCategoria.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ ...tdStyle, textAlign: "center", color: "#888", padding: 24 }}>
                        Sin gastos este mes.
                      </td>
                    </tr>
                  )}
                  {gastosPorCategoria.map((g, i) => (
                    <tr key={g.categoria} style={{ background: i % 2 === 1 ? "#F4ECF7" : "white", borderTop: "1px solid #eee" }}>
                      <td style={{ ...tdStyle, fontWeight: 700 }}>{g.categoria}</td>
                      <td style={tdStyle}>{fmtMoney(g.total)}</td>
                      <td style={tdStyle}>{totalGasto > 0 ? ((g.total / totalGasto) * 100).toFixed(1) : "0.0"}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "evolucion" && (
        <div>
          <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
            {evolucion.length === 0 ? (
              <div style={{ fontSize: 12, color: "#888", padding: "30px 0", textAlign: "center" }}>
                Cargá movimientos o empleados para ver la evolución.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={evolucion} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (v >= 1000000 ? `${Math.round(v / 1000000)}M` : v)} width={40} />
                  <Tooltip formatter={(v) => fmtMoney(v as number)} labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="ingresos" name="Ingresos" fill="#1E7B34" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="gastos" name="Gastos" fill="#8C0000" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="utilidad" name="Utilidad" fill={PURPLE} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Mes</th>
                  <th style={thStyle}>Ingresos</th>
                  <th style={thStyle}>Gastos</th>
                  <th style={thStyle}>Utilidad</th>
                  <th style={thStyle}>Margen</th>
                </tr>
              </thead>
              <tbody>
                {evolucion.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ ...tdStyle, textAlign: "center", color: "#888", padding: 24 }}>
                      Todavía no hay datos.
                    </td>
                  </tr>
                )}
                {evolucion.map((e, i) => {
                  const margen = e.ingresos > 0 ? (e.utilidad / e.ingresos) * 100 : 0;
                  return (
                    <tr key={e.key} style={{ background: i % 2 === 1 ? "#F4ECF7" : "white", borderTop: "1px solid #eee" }}>
                      <td style={{ ...tdStyle, fontWeight: 700 }}>{e.label}</td>
                      <td style={tdStyle}>{fmtMoney(e.ingresos)}</td>
                      <td style={tdStyle}>{fmtMoney(e.gastos)}</td>
                      <td style={{ ...tdStyle, fontWeight: 700, color: e.utilidad >= 0 ? PURPLE : "#922B21" }}>{fmtMoney(e.utilidad)}</td>
                      <td style={tdStyle}>{margen.toFixed(1)}%</td>
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
