"use client";

import { useMemo, useState } from "react";
import { computeResumenColaborador, diasEnMes, fmtMoneyEmp } from "@/lib/empleados/calculos";
import { descargarRecibo } from "@/lib/empleados/recibo";
import { GREEN, inputStyle } from "@/lib/empleados/estilos";
import { MESES } from "../EmpleadosShell";
import type { Colaborador, ParametrosEmpleados, RegistroAsistencia } from "@/lib/empleados/types";

export default function ReciboTab({
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
  const [codigo, setCodigo] = useState("");
  const mesLabel = `${MESES[mes - 1]} ${anio}`;
  const claveMesActual = `${anio}-${String(mes).padStart(2, "0")}`;

  const colaborador = colaboradores.find((c) => c.codigo === codigo) || null;
  const resumen = useMemo(() => {
    if (!colaborador) return null;
    const registro = registros.find((r) => r.colaborador_id === colaborador.id && r.mes === claveMesActual);
    return computeResumenColaborador(colaborador, registro, parametros, diasEnMes(anio, mes));
  }, [colaborador, registros, parametros, anio, mes, claveMesActual]);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <select value={codigo} onChange={(e) => setCodigo(e.target.value)} style={{ ...inputStyle, maxWidth: 280 }}>
          <option value="">Elegir colaborador...</option>
          {colaboradores.map((c) => (
            <option key={c.id} value={c.codigo}>{c.codigo} — {c.nombre}</option>
          ))}
        </select>
        {colaborador && resumen && (
          <button
            onClick={() => descargarRecibo(colaborador, resumen, mesLabel)}
            style={{ background: GREEN, color: "white", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
          >
            Descargar recibo
          </button>
        )}
      </div>

      {colaborador && resumen && (
        <div id="recibo-imprimible" style={{ background: "white", border: "1px solid #ddd", borderRadius: 10, padding: 24, maxWidth: 480 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: GREEN }}>EL NUEVO RURAL</h2>
          <p style={{ fontSize: 12, color: "#666", marginTop: 2, marginBottom: 16 }}>
            Recibo de Sueldo (uso interno — no reemplaza el recibo legal)
          </p>

          {[
            ["Colaborador", `${colaborador.nombre} (${colaborador.codigo})`],
            ["Área / Cargo", `${colaborador.area || "-"} / ${colaborador.cargo || "-"}`],
            ["Período", mesLabel],
            ["Tipo de Pago", colaborador.tipo_pago],
            ["Valor", fmtMoneyEmp(colaborador.valor)],
          ].map(([label, val]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13, borderBottom: "1px solid #f0f0f0" }}>
              <span>{label}</span>
              <span>{val}</span>
            </div>
          ))}

          <h3 style={{ color: GREEN, fontSize: 13, margin: "18px 0 6px" }}>DETALLE DE ASISTENCIA</h3>
          {[
            ["Días completos", resumen.diasCompletos],
            ["Días media jornada", resumen.diasMedia],
            ["Días francos", resumen.diaFranco],
            ["Faltas injustificadas", resumen.faltaInj],
            ["Faltas justificadas", resumen.faltaJust],
            ["Vacaciones", resumen.vacaciones],
            ["Descanso médico", resumen.descMed],
            ["Otras", resumen.otras],
            ["Horas extra 50%", resumen.he50],
            ["Horas extra 100%", resumen.he100],
          ].map(([label, val]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13, borderBottom: "1px solid #f0f0f0" }}>
              <span>{label}</span>
              <span>{val}</span>
            </div>
          ))}

          <h3 style={{ color: GREEN, fontSize: 13, margin: "18px 0 6px" }}>RESUMEN DE PAGO</h3>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13, borderBottom: "1px solid #f0f0f0" }}>
            <span>Pago base</span>
            <span>{fmtMoneyEmp(resumen.pagoBase)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13, borderBottom: "1px solid #f0f0f0" }}>
            <span>Pago horas extra</span>
            <span>{fmtMoneyEmp(resumen.pagoHE)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 0", marginTop: 8, fontSize: 15, fontWeight: 700, borderTop: `2px solid ${GREEN}` }}>
            <span>TOTAL A PAGAR</span>
            <span>{fmtMoneyEmp(resumen.totalPagar)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
