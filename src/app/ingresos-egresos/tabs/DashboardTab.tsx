"use client";

import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid,
} from "recharts";
import { buildResumenMensualIE, buildResumenProveedorIE, fmtMoneyIE } from "@/lib/ingresos-egresos/calculos";
import { buildResumenCategoria } from "@/lib/ingresos-egresos/calculos";
import { IE_PIE_COLORS } from "@/lib/ingresos-egresos/estilos";
import type { Movimiento } from "@/lib/ingresos-egresos/types";

export default function DashboardTab({ movs }: { movs: Movimiento[] }) {
  const resumenMensual = useMemo(() => buildResumenMensualIE(movs), [movs]);
  const resumenCategoria = useMemo(
    () => buildResumenCategoria(movs, []).filter((c) => c.egresos > 0),
    [movs],
  );
  const resumenProveedor = useMemo(() => buildResumenProveedorIE(movs).slice(0, 8), [movs]);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)", gap: 14, marginBottom: 20 }}>
        <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#C00000", marginBottom: 8 }}>Ingresos vs Egresos por mes</div>
          {resumenMensual.length === 0 ? (
            <div style={{ fontSize: 12, color: "#888", padding: "30px 0", textAlign: "center" }}>Cargá movimientos para ver la evolución mensual.</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={resumenMensual} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (v >= 1000000 ? `${Math.round(v / 1000000)}M` : v)} width={40} />
                <Tooltip formatter={(v) => fmtMoneyIE(v as number)} labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="ingresos" name="Ingresos" fill="#1E7B34" radius={[4, 4, 0, 0]} />
                <Bar dataKey="egresos" name="Egresos" fill="#8C0000" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#C00000", marginBottom: 8 }}>Egresos por categoría</div>
          {resumenCategoria.length === 0 ? (
            <div style={{ fontSize: 12, color: "#888", padding: "30px 0", textAlign: "center" }}>Sin egresos todavía.</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={resumenCategoria} dataKey="egresos" nameKey="categoria" cx="50%" cy="50%" outerRadius={80} label={(entry) => entry.name} labelLine={false} style={{ fontSize: 10 }}>
                  {resumenCategoria.map((entry, i) => (
                    <Cell key={i} fill={IE_PIE_COLORS[i % IE_PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => fmtMoneyIE(v as number)} contentStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 10, padding: "14px 16px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#C00000", marginBottom: 8 }}>Top proveedores por total pagado</div>
        {resumenProveedor.length === 0 ? (
          <div style={{ fontSize: 12, color: "#888", padding: "30px 0", textAlign: "center" }}>Sin pagos a proveedores todavía.</div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(180, resumenProveedor.length * 34)}>
            <BarChart data={resumenProveedor} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eee" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => (v >= 1000000 ? `${Math.round(v / 1000000)}M` : v)} />
              <YAxis type="category" dataKey="proveedor" tick={{ fontSize: 11 }} width={140} />
              <Tooltip formatter={(v) => fmtMoneyIE(v as number)} contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="total" fill="#C00000" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
