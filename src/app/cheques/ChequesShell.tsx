"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { enriquecerCheques } from "@/lib/cheques/calculos";
import { NAVY } from "@/lib/cheques/estilos";
import { useConfirmDialog } from "../useConfirmDialog";
import TablaTab from "./tabs/TablaTab";
import ProveedoresTab from "./tabs/ProveedoresTab";
import MensualTab from "./tabs/MensualTab";
import AntiguedadTab from "./tabs/AntiguedadTab";
import ConciliacionTab from "./tabs/ConciliacionTab";
import TercerosTab from "./tabs/TercerosTab";
import HistorialTab from "./tabs/HistorialTab";
import type {
  Cheque,
  ChequeEnriquecido,
  ChequeTercero,
  LimiteProveedor,
  NuevoCheque,
  NuevoChequeTercero,
} from "@/lib/cheques/types";

const TABS: { key: string; label: string }[] = [
  { key: "tabla", label: "Tabla y dashboard" },
  { key: "proveedores", label: "Resumen por proveedor" },
  { key: "mensual", label: "Resumen mensual" },
  { key: "antiguedad", label: "Antigüedad" },
  { key: "conciliacion", label: "Conciliación bancaria" },
  { key: "terceros", label: "Cheques de Terceros" },
  { key: "historial", label: "Historial" },
];

function normalizarChequeImportado(raw: Record<string, unknown>): NuevoCheque {
  const get = (a: string, b: string) => (raw[a] ?? raw[b]) as unknown;
  return {
    n_cheque: (get("n_cheque", "nCheque") as string) || null,
    proveedor: (raw.proveedor as string) || "",
    fecha_emision: (get("fecha_emision", "fechaEmision") as string) || null,
    fecha_cobro: (get("fecha_cobro", "fechaCobro") as string) || null,
    importe: Number(raw.importe) || 0,
    debito_banco: get("debito_banco", "debitoBanco") ? Number(get("debito_banco", "debitoBanco")) : null,
    rechazado: Boolean(raw.rechazado),
    tipo: raw.tipo === "E-cheque" ? "E-cheque" : "Físico",
    entregado: Boolean(raw.entregado),
    observaciones: (raw.observaciones as string) || null,
  };
}

export default function ChequesShell({
  esAdmin,
  userId,
  chequesIniciales,
  tercerosIniciales,
  limitesIniciales,
}: {
  esAdmin: boolean;
  userId: string;
  chequesIniciales: Cheque[];
  tercerosIniciales: ChequeTercero[];
  limitesIniciales: LimiteProveedor[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const { pedirConfirmacion, ConfirmModal } = useConfirmDialog();

  const [cheques, setCheques] = useState<Cheque[]>(chequesIniciales);
  const [terceros, setTerceros] = useState<ChequeTercero[]>(tercerosIniciales);
  const [limites, setLimites] = useState<Record<string, number>>(() =>
    Object.fromEntries(limitesIniciales.map((l) => [l.proveedor, l.limite])),
  );
  const [tab, setTab] = useState("tabla");
  const [saveError, setSaveError] = useState("");

  const enriched = useMemo(() => enriquecerCheques(cheques), [cheques]);

  async function addCheque(nuevo: NuevoCheque) {
    const { data, error } = await supabase
      .from("cheques")
      .insert({ ...nuevo, creado_por: userId })
      .select()
      .single();
    if (error || !data) {
      setSaveError("No se pudo guardar. Probá de nuevo.");
      return null;
    }
    setSaveError("");
    setCheques((prev) => [...prev, data as Cheque]);
    return data as Cheque;
  }

  async function updateCheque(id: string, patch: Partial<Cheque>) {
    const { data, error } = await supabase
      .from("cheques")
      .update({ ...patch, modificado_el: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error || !data) {
      setSaveError("No se pudo guardar. Probá de nuevo.");
      return;
    }
    setSaveError("");
    setCheques((prev) => prev.map((c) => (c.id === id ? (data as Cheque) : c)));
  }

  function deleteCheque(id: string) {
    pedirConfirmacion("¿Eliminar este cheque? Esta acción no se puede deshacer.", async () => {
      const { error } = await supabase.from("cheques").delete().eq("id", id);
      if (error) {
        setSaveError("No se pudo eliminar. Probá de nuevo.");
        return;
      }
      setCheques((prev) => prev.filter((c) => c.id !== id));
    });
  }

  async function duplicarCheque(c: ChequeEnriquecido) {
    const nuevo: NuevoCheque = {
      n_cheque: "",
      proveedor: c.proveedor,
      fecha_emision: new Date().toISOString().slice(0, 10),
      fecha_cobro: null,
      importe: c.importe,
      debito_banco: null,
      rechazado: false,
      tipo: c.tipo || "Físico",
      entregado: false,
      observaciones: c.observaciones || "",
    };
    return addCheque(nuevo);
  }

  async function restaurarBackup(file: File) {
    const texto = await file.text();
    let data: { cheques?: unknown[]; limites?: Record<string, number> };
    try {
      data = JSON.parse(texto);
    } catch {
      window.alert("El archivo no es un backup válido de esta app.");
      return;
    }
    if (!Array.isArray(data.cheques)) {
      window.alert("El archivo no es un backup válido de esta app.");
      return;
    }
    const nuevosCheques = data.cheques;
    const nuevosLimites = data.limites || {};

    const ejecutar = async () => {
      const { error: delErr } = await supabase.from("cheques").delete().not("id", "is", null);
      if (delErr) {
        console.error(delErr);
        setSaveError(`No se pudo restaurar el backup: ${delErr.message}`);
        return;
      }
      const payload = nuevosCheques.map((c) => ({
        ...normalizarChequeImportado(c as Record<string, unknown>),
        creado_por: userId,
      }));
      const { data: inserted, error: insErr } = await supabase.from("cheques").insert(payload).select();
      if (insErr) {
        console.error(insErr);
        setSaveError(`No se pudo restaurar el backup: ${insErr.message}`);
        return;
      }
      setCheques((inserted ?? []) as Cheque[]);

      await supabase.from("limites_proveedores_cheques").delete().not("proveedor", "is", null);
      const limitesPayload = Object.entries(nuevosLimites).map(([proveedor, limite]) => ({
        proveedor,
        limite: Number(limite),
      }));
      if (limitesPayload.length > 0) {
        await supabase.from("limites_proveedores_cheques").insert(limitesPayload);
      }
      setLimites(Object.fromEntries(limitesPayload.map((l) => [l.proveedor, l.limite])));
      setSaveError("");
    };

    if (cheques.length > 0) {
      pedirConfirmacion(
        `Esto va a REEMPLAZAR los ${cheques.length} cheques actuales por los ${nuevosCheques.length} del backup. ¿Continuar?`,
        ejecutar,
      );
    } else {
      await ejecutar();
    }
  }

  async function addTercero(nuevo: NuevoChequeTercero) {
    const payload = { ...nuevo, estado: "En cartera" as const, entregado_a: null, fecha_entrega: null };
    const { data, error } = await supabase.from("cheques_terceros").insert(payload).select().single();
    if (error || !data) {
      setSaveError("No se pudo guardar. Probá de nuevo.");
      return;
    }
    setSaveError("");
    setTerceros((prev) => [...prev, data as ChequeTercero]);
  }

  async function updateTercero(id: string, patch: Partial<ChequeTercero>) {
    const { data, error } = await supabase
      .from("cheques_terceros")
      .update({ ...patch, modificado_el: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error || !data) {
      setSaveError("No se pudo guardar. Probá de nuevo.");
      return;
    }
    setSaveError("");
    setTerceros((prev) => prev.map((t) => (t.id === id ? (data as ChequeTercero) : t)));
  }

  function deleteTercero(id: string) {
    pedirConfirmacion("¿Eliminar este cheque de tercero? Esta acción no se puede deshacer.", async () => {
      const { error } = await supabase.from("cheques_terceros").delete().eq("id", id);
      if (error) {
        setSaveError("No se pudo eliminar. Probá de nuevo.");
        return;
      }
      setTerceros((prev) => prev.filter((t) => t.id !== id));
    });
  }

  function cambiarEstadoTercero(id: string, estado: ChequeTercero["estado"]) {
    updateTercero(id, {
      estado,
      ...(estado !== "Entregado" ? { entregado_a: null, fecha_entrega: null } : {}),
    });
  }

  async function setLimiteProveedor(proveedor: string, valor: string) {
    const num = parseFloat(valor);
    if (!valor || !(num > 0)) {
      await supabase.from("limites_proveedores_cheques").delete().eq("proveedor", proveedor);
      setLimites((prev) => {
        const next = { ...prev };
        delete next[proveedor];
        return next;
      });
    } else {
      await supabase.from("limites_proveedores_cheques").upsert({ proveedor, limite: num });
      setLimites((prev) => ({ ...prev, [proveedor]: num }));
    }
  }

  return (
    <div style={{ fontFamily: "Arial, sans-serif", maxWidth: 1200, margin: "0 auto", padding: 20, color: "#1A1A2E", background: "white", minHeight: "100vh" }}>
      <div
        style={{
          background: NAVY,
          color: "white",
          padding: "18px 24px",
          borderRadius: 10,
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div
          style={{
            width: 50,
            height: 50,
            borderRadius: 12,
            flexShrink: 0,
            overflow: "hidden",
            boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
          }}
        >
          <Image src="/logo.jpg" alt="Logo El Nuevo Rural" width={50} height={50} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: 0.3 }}>EL NUEVO RURAL</h1>
          <p style={{ margin: "2px 0 0", fontSize: 13, opacity: 0.85 }}>
            Control de Cheques · {cheques.length} cheques cargados
          </p>
        </div>
        <Link href="/ingresos-egresos" style={{ color: "white", fontSize: 13, fontWeight: 700, opacity: 0.9 }}>
          Ingresos y Egresos
        </Link>
        <Link href="/empleados" style={{ color: "white", fontSize: 13, fontWeight: 700, opacity: 0.9 }}>
          Empleados
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
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              border: "none",
              background: "transparent",
              padding: "10px 14px",
              fontSize: 13,
              fontWeight: 700,
              color: tab === key ? NAVY : "#888",
              borderBottom: tab === key ? `2px solid ${NAVY}` : "2px solid transparent",
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "tabla" && (
        <TablaTab
          cheques={cheques}
          enriched={enriched}
          esAdmin={esAdmin}
          onAdd={addCheque}
          onUpdate={updateCheque}
          onDelete={deleteCheque}
          onDuplicate={duplicarCheque}
          onRestaurarBackup={restaurarBackup}
        />
      )}
      {tab === "proveedores" && (
        <ProveedoresTab enriched={enriched} limites={limites} onSetLimite={setLimiteProveedor} />
      )}
      {tab === "mensual" && <MensualTab enriched={enriched} />}
      {tab === "antiguedad" && <AntiguedadTab enriched={enriched} />}
      {tab === "conciliacion" && (
        <ConciliacionTab
          enriched={enriched}
          pedirConfirmacion={pedirConfirmacion}
          onConfirmarPago={(chequeId, importeBanco) => updateCheque(chequeId, { debito_banco: importeBanco })}
        />
      )}
      {tab === "terceros" && (
        <TercerosTab
          terceros={terceros}
          onAdd={addTercero}
          onUpdate={updateTercero}
          onDelete={deleteTercero}
          onCambiarEstado={cambiarEstadoTercero}
        />
      )}
      {tab === "historial" && <HistorialTab enriched={enriched} />}

      <ConfirmModal />
    </div>
  );
}
