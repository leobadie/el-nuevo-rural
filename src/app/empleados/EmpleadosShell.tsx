"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { GREEN } from "@/lib/empleados/estilos";
import { useConfirmDialog } from "../useConfirmDialog";
import RegistroTab from "./tabs/RegistroTab";
import ColaboradoresTab from "./tabs/ColaboradoresTab";
import ResumenTab from "./tabs/ResumenTab";
import ReciboTab from "./tabs/ReciboTab";
import type {
  Colaborador,
  NuevoColaborador,
  ParametrosEmpleados,
  RegistroAsistencia,
} from "@/lib/empleados/types";

export const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function claveMes(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

export default function EmpleadosShell({
  esAdmin,
  colaboradoresIniciales,
  registrosIniciales,
  parametrosIniciales,
}: {
  esAdmin: boolean;
  colaboradoresIniciales: Colaborador[];
  registrosIniciales: RegistroAsistencia[];
  parametrosIniciales: ParametrosEmpleados;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { pedirConfirmacion, ConfirmModal } = useConfirmDialog();

  const [colaboradores, setColaboradores] = useState<Colaborador[]>(colaboradoresIniciales);
  const [registros, setRegistros] = useState<RegistroAsistencia[]>(registrosIniciales);
  const [parametros, setParametros] = useState<ParametrosEmpleados>(parametrosIniciales);
  const [tab, setTab] = useState("registro");
  const [saveError, setSaveError] = useState("");
  const hoy = new Date();
  const [mesSel, setMesSel] = useState({ anio: hoy.getFullYear(), mes: hoy.getMonth() + 1 });

  const mes = claveMes(mesSel.anio, mesSel.mes);

  const tabs = [
    { key: "registro", label: "Registro Mensual" },
    { key: "colaboradores", label: "Colaboradores" },
    { key: "resumen", label: "Resumen" },
    { key: "recibo", label: "Recibo de Sueldo" },
  ];

  async function agregarColaborador(nuevo: NuevoColaborador) {
    if (colaboradores.some((c) => c.codigo.toLowerCase() === nuevo.codigo.toLowerCase())) {
      window.alert("Ya existe un colaborador con ese código.");
      return;
    }
    const { data, error } = await supabase.from("colaboradores").insert(nuevo).select().single();
    if (error || !data) {
      setSaveError("No se pudo guardar. Probá de nuevo.");
      return;
    }
    setSaveError("");
    setColaboradores((prev) => [...prev, data as Colaborador].sort((a, b) => a.nombre.localeCompare(b.nombre)));
  }

  async function editarColaborador(id: string, patch: Partial<Colaborador>) {
    const { data, error } = await supabase.from("colaboradores").update(patch).eq("id", id).select().single();
    if (error || !data) {
      setSaveError("No se pudo guardar. Probá de nuevo.");
      return;
    }
    setSaveError("");
    setColaboradores((prev) => prev.map((c) => (c.id === id ? (data as Colaborador) : c)));
  }

  function eliminarColaborador(id: string) {
    pedirConfirmacion(
      "¿Eliminar este colaborador? También se van a borrar sus registros de asistencia. Esta acción no se puede deshacer.",
      async () => {
        const { error } = await supabase.from("colaboradores").delete().eq("id", id);
        if (error) {
          setSaveError("No se pudo eliminar. Probá de nuevo.");
          return;
        }
        setColaboradores((prev) => prev.filter((c) => c.id !== id));
        setRegistros((prev) => prev.filter((r) => r.colaborador_id !== id));
      },
    );
  }

  async function actualizarDia(colaboradorId: string, diaMes: string, codigo: string) {
    const actual = registros.find((r) => r.colaborador_id === colaboradorId && r.mes === mes);
    const nuevosDias = { ...(actual?.dias || {}) };
    if (codigo) nuevosDias[diaMes] = codigo;
    else delete nuevosDias[diaMes];

    const { data, error } = await supabase
      .from("registros_asistencia")
      .upsert(
        { colaborador_id: colaboradorId, mes, dias: nuevosDias, he_50: actual?.he_50 ?? 0, he_100: actual?.he_100 ?? 0 },
        { onConflict: "colaborador_id,mes" },
      )
      .select()
      .single();
    if (error || !data) {
      setSaveError("No se pudo guardar. Probá de nuevo.");
      return;
    }
    setSaveError("");
    setRegistros((prev) => {
      const sinViejo = prev.filter((r) => !(r.colaborador_id === colaboradorId && r.mes === mes));
      return [...sinViejo, data as RegistroAsistencia];
    });
  }

  async function actualizarHoras(colaboradorId: string, campo: "he_50" | "he_100", valor: number) {
    const actual = registros.find((r) => r.colaborador_id === colaboradorId && r.mes === mes);
    const { data, error } = await supabase
      .from("registros_asistencia")
      .upsert(
        {
          colaborador_id: colaboradorId,
          mes,
          dias: actual?.dias || {},
          he_50: campo === "he_50" ? valor : actual?.he_50 ?? 0,
          he_100: campo === "he_100" ? valor : actual?.he_100 ?? 0,
        },
        { onConflict: "colaborador_id,mes" },
      )
      .select()
      .single();
    if (error || !data) {
      setSaveError("No se pudo guardar. Probá de nuevo.");
      return;
    }
    setSaveError("");
    setRegistros((prev) => {
      const sinViejo = prev.filter((r) => !(r.colaborador_id === colaboradorId && r.mes === mes));
      return [...sinViejo, data as RegistroAsistencia];
    });
  }

  async function actualizarParametros(patch: Partial<ParametrosEmpleados>) {
    const nuevos = { ...parametros, ...patch };
    setParametros(nuevos);
    const { error } = await supabase.from("parametros_empleados").update(patch).eq("id", true);
    if (error) {
      setSaveError("No se pudo guardar el parámetro. Probá de nuevo.");
    }
  }

  return (
    <div style={{ fontFamily: "Arial, sans-serif", maxWidth: 1200, margin: "0 auto", padding: 20, color: "#1A1A2E", background: "white", minHeight: "100vh" }}>
      <div
        style={{
          background: GREEN,
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
          <p style={{ margin: "2px 0 0", fontSize: 13, opacity: 0.85 }}>
            Empleados · {colaboradores.length} colaboradores
          </p>
        </div>
        {esAdmin && (
          <Link href="/cheques" style={{ color: "white", fontSize: 13, fontWeight: 700, opacity: 0.9 }}>
            Cheques
          </Link>
        )}
        <Link href="/ingresos-egresos" style={{ color: "white", fontSize: 13, fontWeight: 700, opacity: 0.9 }}>
          Ingresos y Egresos
        </Link>
        {esAdmin && (
          <Link href="/rentabilidad" style={{ color: "white", fontSize: 13, fontWeight: 700, opacity: 0.9 }}>
            Rentabilidad
          </Link>
        )}
        <Link href="/" style={{ color: "white", fontSize: 13, fontWeight: 700, opacity: 0.9 }}>
          ← Volver
        </Link>
      </div>

      {saveError && (
        <div style={{ background: "#FADBD8", color: "#922B21", padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
          {saveError}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 16, borderBottom: "1px solid #ddd", flexWrap: "wrap" }}>
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              border: "none",
              background: "transparent",
              padding: "10px 14px",
              fontSize: 13,
              fontWeight: 700,
              color: tab === key ? GREEN : "#888",
              borderBottom: tab === key ? `2px solid ${GREEN}` : "2px solid transparent",
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {(tab === "registro" || tab === "resumen") && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
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
      )}

      {tab === "registro" && (
        <RegistroTab
          colaboradores={colaboradores}
          registros={registros}
          parametros={parametros}
          anio={mesSel.anio}
          mes={mesSel.mes}
          onActualizarDia={actualizarDia}
          onActualizarHoras={actualizarHoras}
        />
      )}
      {tab === "colaboradores" && (
        <ColaboradoresTab
          colaboradores={colaboradores}
          parametros={parametros}
          onAdd={agregarColaborador}
          onUpdate={editarColaborador}
          onDelete={eliminarColaborador}
          onUpdateParametros={actualizarParametros}
        />
      )}
      {tab === "resumen" && (
        <ResumenTab colaboradores={colaboradores} registros={registros} parametros={parametros} anio={mesSel.anio} mes={mesSel.mes} />
      )}
      {tab === "recibo" && (
        <ReciboTab colaboradores={colaboradores} registros={registros} parametros={parametros} anio={mesSel.anio} mes={mesSel.mes} />
      )}

      <ConfirmModal />
    </div>
  );
}
