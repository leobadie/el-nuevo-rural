"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import MunicipalidadVista, { COLOR_MUNI, type HandlersMunicipalidad } from "./MunicipalidadVista";
import type {
  CobroMunicipalidad,
  FacturaMunicipalidad,
  ImputacionCobro,
} from "@/lib/municipalidad/types";

/** Traduce los errores de la base que el usuario puede provocar a algo que se entienda. */
function mensajeError(error: { code?: string; message?: string } | null, porDefecto: string): string {
  if (!error) return porDefecto;
  // 23505 = unique violation. La única restricción única del módulo es el número de factura.
  if (error.code === "23505") return "Ya hay una factura cargada con ese número.";
  if (error.message?.includes("supera")) return "Esa factura ya no tiene tanto saldo, o el cobro no tiene tanto disponible. Recargá la página.";
  if (error.message?.includes("debajo de lo ya")) return "No se puede bajar el monto por debajo de lo que ya se cobró. Deshacé primero la aplicación del cobro.";
  return `${porDefecto} Probá de nuevo.`;
}

export default function MunicipalidadShell({
  esAdmin,
  userId,
  faltaMigracion,
  facturasIniciales,
  cobrosIniciales,
  imputacionesIniciales,
}: {
  esAdmin: boolean;
  userId: string;
  faltaMigracion: boolean;
  facturasIniciales: FacturaMunicipalidad[];
  cobrosIniciales: CobroMunicipalidad[];
  imputacionesIniciales: ImputacionCobro[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [facturas, setFacturas] = useState(facturasIniciales);
  const [cobros, setCobros] = useState(cobrosIniciales);
  const [imputaciones, setImputaciones] = useState(imputacionesIniciales);

  const handlers: HandlersMunicipalidad = {
    async onGuardarFactura(datos, id) {
      const consulta = id
        ? supabase.from("facturas_municipalidad").update(datos).eq("id", id)
        : supabase.from("facturas_municipalidad").insert({ ...datos, creado_por: userId });
      const { data, error } = await consulta.select().single();
      if (error || !data) {
        console.error(error);
        return mensajeError(error, "No se pudo guardar la factura.");
      }
      const f = data as FacturaMunicipalidad;
      setFacturas((prev) => (id ? prev.map((x) => (x.id === id ? f : x)) : [...prev, f]));
      return null;
    },

    async onEliminarFactura(id) {
      // Con RLS, un delete que no tiene permiso no da error: borra 0 filas. Por eso se pide la fila de vuelta.
      const { data, error } = await supabase.from("facturas_municipalidad").delete().eq("id", id).select("id");
      if (error || !data?.length) return "No se pudo eliminar la factura (sólo un administrador puede).";
      setFacturas((prev) => prev.filter((f) => f.id !== id));
      // En la base las imputaciones se van en cascada; acá hay que sacarlas a mano.
      setImputaciones((prev) => prev.filter((i) => i.factura_id !== id));
      return null;
    },

    async onRegistrarCobro(datos, aplicaciones) {
      const { data, error } = await supabase
        .from("cobros_municipalidad")
        .insert({ ...datos, creado_por: userId })
        .select()
        .single();
      if (error || !data) {
        console.error(error);
        return mensajeError(error, "No se pudo guardar el cobro.");
      }
      const cobro = data as CobroMunicipalidad;
      setCobros((prev) => [...prev, cobro]);
      if (aplicaciones.length === 0) return null;

      const { data: imps, error: errImp } = await supabase
        .from("imputaciones_cobro_municipalidad")
        .insert(aplicaciones.map((a) => ({ ...a, cobro_id: cobro.id })))
        .select();
      if (errImp || !imps) {
        console.error(errImp);
        return "El cobro se guardó, pero no se pudo aplicar a las facturas. Aplicalo desde la pestaña Cobros.";
      }
      setImputaciones((prev) => [...prev, ...(imps as ImputacionCobro[])]);
      return null;
    },

    async onEliminarCobro(id) {
      const { data, error } = await supabase.from("cobros_municipalidad").delete().eq("id", id).select("id");
      if (error || !data?.length) return "No se pudo eliminar el cobro (sólo un administrador puede).";
      setCobros((prev) => prev.filter((c) => c.id !== id));
      setImputaciones((prev) => prev.filter((i) => i.cobro_id !== id));
      return null;
    },

    async onImputar(aplicaciones) {
      if (aplicaciones.length === 0) return null;
      const { data, error } = await supabase.from("imputaciones_cobro_municipalidad").insert(aplicaciones).select();
      if (error || !data) {
        console.error(error);
        return mensajeError(error, "No se pudo aplicar el cobro.");
      }
      setImputaciones((prev) => [...prev, ...(data as ImputacionCobro[])]);
      return null;
    },

    async onDesimputar(ids) {
      const { error } = await supabase.from("imputaciones_cobro_municipalidad").delete().in("id", ids);
      if (error) return "No se pudo deshacer la aplicación. Probá de nuevo.";
      setImputaciones((prev) => prev.filter((i) => !ids.includes(i.id)));
      return null;
    },
  };

  return (
    // minWidth: 0 no es decorativo: este div es hijo de un body flex, y sin él el ancho mínimo
    // de la tabla estira el documento entero y deja botones fuera de la pantalla en móvil.
    <div style={{ fontFamily: "Arial, sans-serif", maxWidth: 1200, width: "100%", minWidth: 0, margin: "0 auto", padding: 20, color: "#1A1A2E", background: "white", minHeight: "100vh", boxSizing: "border-box" }}>
      <div style={{ background: COLOR_MUNI, color: "white", padding: "18px 24px", borderRadius: 10, marginBottom: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ width: 50, height: 50, borderRadius: 12, flexShrink: 0, overflow: "hidden", boxShadow: "0 2px 6px rgba(0,0,0,0.25)" }}>
          <Image src="/logo.jpg" alt="Logo El Nuevo Rural" width={50} height={50} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        <div style={{ flex: "1 1 180px", minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: 0.3 }}>EL NUEVO RURAL</h1>
          <p style={{ margin: "2px 0 0", fontSize: 13, opacity: 0.85 }}>Municipalidad · Cobranzas del PAICOR</p>
        </div>
        <Link href="/" style={{ color: "white", fontSize: 13, fontWeight: 700, opacity: 0.9 }}>
          ← Volver
        </Link>
      </div>

      {faltaMigracion ? (
        <div style={{ background: "#FDEBD0", color: "#784212", padding: "14px 16px", borderRadius: 8, fontSize: 14 }} data-test="falta-migracion">
          <strong>Falta crear las tablas en la base.</strong> Hay que pegar{" "}
          <code>supabase/018_municipalidad.sql</code> en el editor SQL de Supabase y recargar esta página.
        </div>
      ) : (
        <MunicipalidadVista facturas={facturas} cobros={cobros} imputaciones={imputaciones} esAdmin={esAdmin} handlers={handlers} />
      )}
    </div>
  );
}
