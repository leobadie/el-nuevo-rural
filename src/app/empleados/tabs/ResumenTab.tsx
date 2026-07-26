"use client";

import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid,
} from "recharts";
import { computeResumenColaborador, diasEnMes, fmtMoneyEmp } from "@/lib/empleados/calculos";
import { GREEN } from "@/lib/empleados/estilos";
import { IE_PIE_COLORS } from "@/lib/ingresos-egresos/estilos";
import { MESES } from "../EmpleadosShell";
import type { Colaborador, ParametrosEmpleados, RegistroAsistencia } from "@/lib/empleados/types";

const AUSENTISMO_COLORES: Record<string, string> = {
  "F.Inj.": "#922B21",
  "F.Just.": "#B9770E",
  "Vacaciones": "#B7950B",
  "Desc.Méd.": "#6C3483",
  "Otras": "#616A6B",
};

export default function ResumenTab({
  colaboradores,
  registros,
  parametros,
  anio,
  mes,
}: {
  colaboradores: Colaborador[];
  registros: RegistroAsistencia[];
  parametros: ParametrosEmpleados;
  anio: number;
  mes: number;
}) {
  const claveMesActual = `${anio}-${String(mes).padStart(2, "0")}`;

  const evolucionMensual = useMemo(() => {
    const claves = Array.from(new Set(registros.map((r) => r.mes))).sort();
    return claves.map((clave) => {
      const [y, m] = clave.split("-").map(Number);
      const total = colaboradores.reduce((s, c) => {
        const registro = registros.find((r) => r.colaborador_id === c.id && r.mes === clave);
        return s + computeResumenColaborador(c, registro, parametros, diasEnMes(y, m)).totalPagar;
      }, 0);
      return { label: `${MESES[m - 1].slice(0, 3)} ${y}`, total: Math.round(total) };
    });
  }, [registros, colaboradores, parametros]);

  const resumenMes = useMemo(() => {
    const totalDias = diasEnMes(anio, mes);
    return colaboradores.map((c) => {
      const registro = registros.find((r) => r.colaborador_id === c.id && r.mes === claveMesActual);
      return { colaborador: c, resumen: computeResumenColaborador(c, registro, parametros, totalDias) };
    });
  }, [colaboradores, registros, parametros, anio, mes, claveMesActual]);

  const costoPorArea = useMemo(() => {
    const map: Record<string, number> = {};
    resumenMes.forEach(({ colaborador, resumen }) => {
      const area = colaborador.area || "(sin área)";
      map[area] = (map[area] || 0) + resumen.totalPagar;
    });
    return Object.entries(map).map(([area, total]) => ({ area, total: Math.round(total) }));
  }, [resumenMes]);

  const ausentismo = useMemo(
    () =>
      resumenMes.map(({ colaborador, resumen }) => ({
        nombre: colaborador.nombre.split(",")[0].trim(),
        "F.Inj.": resumen.faltaInj,
        "F.Just.": resumen.faltaJust,
        "Vacaciones": resumen.vacaciones,
        "Desc.Méd.": resumen.descMed,
        "Otras": resumen.otras,
      })),
    [resumenMes],
  );

  return (
    <div>
      <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: GREEN, marginBottom: 8 }}>Evolución de la nómina mes a mes</div>
        {evolucionMensual.length === 0 ? (
          <div style={{ fontSize: 12, color: "#888", padding: "30px 0", textAlign: "center" }}>Todavía no hay registros de asistencia.</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={evolucionMensual} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (v >= 1000000 ? `${Math.round(v / 1000000)}M` : v)} width={40} />
              <Tooltip formatter={(v) => fmtMoneyEmp(v as number)} labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="total" fill={GREEN} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.3fr)", gap: 14 }}>
        <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: GREEN, marginBottom: 8 }}>Costo por área (Mes)</div>
          {costoPorArea.length === 0 ? (
            <div style={{ fontSize: 12, color: "#888", padding: "30px 0", textAlign: "center" }}>Sin datos para este mes.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={costoPorArea} dataKey="total" nameKey="area" cx="50%" cy="50%" outerRadius={75} label={(entry) => entry.name} labelLine={false} style={{ fontSize: 10 }}>
                  {costoPorArea.map((entry, i) => (
                    <Cell key={i} fill={IE_PIE_COLORS[i % IE_PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => fmtMoneyEmp(v as number)} contentStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: GREEN, marginBottom: 8 }}>Ausentismo por colaborador (Mes)</div>
          {ausentismo.length === 0 ? (
            <div style={{ fontSize: 12, color: "#888", padding: "30px 0", textAlign: "center" }}>Sin datos para este mes.</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, ausentismo.length * 34)}>
              <BarChart data={ausentismo} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eee" />
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="nombre" tick={{ fontSize: 11 }} width={100} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                {Object.keys(AUSENTISMO_COLORES).map((key) => (
                  <Bar key={key} dataKey={key} stackId="a" fill={AUSENTISMO_COLORES[key]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
