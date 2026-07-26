"use client";

import { useMemo } from "react";
import { computeResumenColaborador, diasEnMes, fmtMoneyEmp } from "@/lib/empleados/calculos";
import { ASISTENCIA_INFO, CODIGOS_ASISTENCIA, GREEN, thStyle, tdStyle } from "@/lib/empleados/estilos";
import type { Colaborador, ParametrosEmpleados, RegistroAsistencia } from "@/lib/empleados/types";

function claveMes(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

export default function RegistroTab({
  colaboradores,
  registros,
  parametros,
  anio,
  mes,
  onActualizarDia,
  onActualizarHoras,
}: {
  colaboradores: Colaborador[];
  registros: RegistroAsistencia[];
  parametros: ParametrosEmpleados;
  anio: number;
  mes: number;
  onActualizarDia: (colaboradorId: string, dia: string, codigo: string) => Promise<void>;
  onActualizarHoras: (colaboradorId: string, campo: "he_50" | "he_100", valor: number) => Promise<void>;
}) {
  const totalDias = diasEnMes(anio, mes);
  const claveMesActual = claveMes(anio, mes);
  const dias = useMemo(() => Array.from({ length: totalDias }, (_, i) => i + 1), [totalDias]);

  const registroPorColaborador = useMemo(() => {
    const map = new Map<string, RegistroAsistencia>();
    registros.forEach((r) => {
      if (r.mes === claveMesActual) map.set(r.colaborador_id, r);
    });
    return map;
  }, [registros, claveMesActual]);

  const filas = useMemo(
    () =>
      colaboradores.map((c) => ({
        colaborador: c,
        registro: registroPorColaborador.get(c.id) || null,
        resumen: computeResumenColaborador(c, registroPorColaborador.get(c.id), parametros, totalDias),
      })),
    [colaboradores, registroPorColaborador, parametros, totalDias],
  );

  const totalNomina = filas.reduce((s, f) => s + f.resumen.totalPagar, 0);
  const totalHE = filas.reduce((s, f) => s + f.resumen.pagoHE, 0);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 16 }}>
        <div style={{ background: "#EAFAF1", color: GREEN, borderRadius: 8, padding: "12px 10px" }}>
          <div style={{ fontSize: 10, fontWeight: 700 }}>TOTAL NÓMINA DEL MES</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtMoneyEmp(totalNomina)}</div>
        </div>
        <div style={{ background: "#EBF2FA", color: "#1F4E78", borderRadius: 8, padding: "12px 10px" }}>
          <div style={{ fontSize: 10, fontWeight: 700 }}>PAGO HORAS EXTRA</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtMoneyEmp(totalHE)}</div>
        </div>
        <div style={{ background: "#F8F9FA", border: "1px solid #eee", borderRadius: 8, padding: "12px 10px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#666" }}>COLABORADORES</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1A1A2E" }}>{colaboradores.length}</div>
        </div>
      </div>

      {colaboradores.length === 0 ? (
        <div style={{ fontSize: 13, color: "#888", padding: "30px 0", textAlign: "center" }}>
          Todavía no cargaste ningún colaborador. Andá a la pestaña &quot;Colaboradores&quot; para agregar el primero.
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
          <table style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, position: "sticky", left: 0, zIndex: 1 }}>Colaborador</th>
                {dias.map((d) => (
                  <th key={d} style={{ ...thStyle, textAlign: "center", padding: "6px 4px" }}>{d}</th>
                ))}
                <th style={thStyle}>HE 50%</th>
                <th style={thStyle}>HE 100%</th>
                <th style={thStyle}>Días</th>
                <th style={thStyle}>Franco</th>
                <th style={thStyle}>F.Inj</th>
                <th style={thStyle}>F.Just</th>
                <th style={thStyle}>Vac.</th>
                <th style={thStyle}>Total a Pagar</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ colaborador, registro, resumen }) => (
                <tr key={colaborador.id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ ...tdStyle, position: "sticky", left: 0, background: "white", fontWeight: 700, whiteSpace: "nowrap" }}>
                    {colaborador.nombre}
                  </td>
                  {dias.map((d) => {
                    const codigo = registro?.dias?.[String(d)] || "";
                    const info = codigo ? ASISTENCIA_INFO[codigo as keyof typeof ASISTENCIA_INFO] : null;
                    return (
                      <td key={d} style={{ padding: 2, textAlign: "center" }}>
                        <select
                          value={codigo}
                          onChange={(e) => onActualizarDia(colaborador.id, String(d), e.target.value)}
                          style={{
                            border: "none",
                            background: info?.bg || "white",
                            color: info?.text || "#888",
                            fontSize: 11,
                            fontWeight: 700,
                            borderRadius: 4,
                            padding: "3px 2px",
                            width: 40,
                          }}
                        >
                          <option value=""></option>
                          {CODIGOS_ASISTENCIA.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                  <td style={tdStyle}>
                    <input
                      type="number"
                      defaultValue={registro?.he_50 ?? 0}
                      onBlur={(e) => onActualizarHoras(colaborador.id, "he_50", parseFloat(e.target.value) || 0)}
                      style={{ width: 60, padding: "4px 6px", borderRadius: 6, border: "1px solid #ccc", fontSize: 12, color: "#1A1A2E", background: "white" }}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      defaultValue={registro?.he_100 ?? 0}
                      onBlur={(e) => onActualizarHoras(colaborador.id, "he_100", parseFloat(e.target.value) || 0)}
                      style={{ width: 60, padding: "4px 6px", borderRadius: 6, border: "1px solid #ccc", fontSize: 12, color: "#1A1A2E", background: "white" }}
                    />
                  </td>
                  <td style={tdStyle}>{resumen.diasCompletos}{resumen.diasMedia > 0 ? ` +${resumen.diasMedia}M` : ""}</td>
                  <td style={tdStyle}>{resumen.diaFranco}</td>
                  <td style={{ ...tdStyle, fontWeight: resumen.faltaInj > 0 ? 700 : 400, color: resumen.faltaInj > 0 ? "#922B21" : "inherit" }}>
                    {resumen.faltaInj}
                  </td>
                  <td style={tdStyle}>{resumen.faltaJust}</td>
                  <td style={tdStyle}>{resumen.vacaciones}</td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{fmtMoneyEmp(resumen.totalPagar)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: 11, color: "#888", marginTop: 12 }}>
        {CODIGOS_ASISTENCIA.map((c) => `${c} = ${ASISTENCIA_INFO[c].label}`).join(" · ")}
      </p>
    </div>
  );
}
