"use client";

import { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { normalizarCorte, normalizarMedia, normalizarPollo } from "@/lib/carniceria/normalizar";
import type { Corte, GastoCarniceria, IngresoPollo, MediaRes, Parametros } from "@/lib/carniceria/types";
import CarniceriaVista, { type HandlersCarniceria } from "./CarniceriaVista";
import { ROJO } from "./ui";

export default function CarniceriaShell({
  userId,
  faltaMigracion,
  faltaMigracionPollo,
  parametros,
  cortes,
  gastos,
  medias,
  pollo,
}: {
  userId: string;
  faltaMigracion: boolean;
  faltaMigracionPollo: boolean;
  parametros: Parametros;
  cortes: Corte[];
  gastos: GastoCarniceria[];
  medias: MediaRes[];
  pollo: IngresoPollo[];
}) {
  const supabase = useMemo(() => createClient(), []);

  const handlers: HandlersCarniceria = {
    async guardarParametro(clave, valor) {
      const consulta =
        valor == null
          ? supabase.from("carniceria_parametros").delete().eq("clave", clave)
          : supabase.from("carniceria_parametros").upsert({ clave, valor, actualizado_el: new Date().toISOString() });
      const { error } = await consulta;
      if (error) {
        console.error(error);
        return "No se pudo guardar el dato. Revisá la conexión y probá de nuevo.";
      }
      return null;
    },

    async guardarCorte({ id, ...datos }) {
      const consulta = id
        ? supabase.from("carniceria_cortes").update(datos).eq("id", id)
        : supabase.from("carniceria_cortes").insert(datos);
      const { data, error } = await consulta.select().single();
      if (error || !data) {
        console.error(error);
        return { error: "No se pudo guardar el corte. Probá de nuevo." };
      }
      return { corte: normalizarCorte(data as Corte) };
    },

    async guardarGasto(gastoFijoId, incluido) {
      const { error } = await supabase.from("carniceria_gastos_fijos").upsert({ gasto_fijo_id: gastoFijoId, incluido });
      if (error) {
        console.error(error);
        return "No se pudo guardar el gasto. Probá de nuevo.";
      }
      return null;
    },

    async guardarMedia(datos, id) {
      const consulta = id
        ? supabase.from("carniceria_medias_reses").update(datos).eq("id", id)
        : supabase.from("carniceria_medias_reses").insert({ ...datos, creado_por: userId });
      const { data, error } = await consulta.select().single();
      if (error || !data) {
        console.error(error);
        return { error: "No se pudo guardar la media res. Probá de nuevo." };
      }
      return { media: normalizarMedia(data as MediaRes) };
    },

    async eliminarMedia(id) {
      // Con RLS, un delete sin permiso no da error: borra 0 filas. Por eso se pide la fila de vuelta.
      const { data, error } = await supabase.from("carniceria_medias_reses").delete().eq("id", id).select("id");
      if (error || !data?.length) return "No se pudo eliminar la media res.";
      return null;
    },

    async guardarPollo(datos, id) {
      const consulta = id
        ? supabase.from("carniceria_pollo").update(datos).eq("id", id)
        : supabase.from("carniceria_pollo").insert({ ...datos, creado_por: userId });
      const { data, error } = await consulta.select().single();
      if (error || !data) {
        console.error(error);
        return { error: "No se pudo guardar el pollo. Probá de nuevo." };
      }
      return { ingreso: normalizarPollo(data as IngresoPollo) };
    },

    async eliminarPollo(id) {
      const { data, error } = await supabase.from("carniceria_pollo").delete().eq("id", id).select("id");
      if (error || !data?.length) return "No se pudo eliminar el ingreso de pollo.";
      return null;
    },
  };

  return (
    // width: 100% y minWidth: 0 no son decorativos: este div es hijo de un body flex, y sin
    // ellos el ancho mínimo de una tabla estira el documento entero en el celular.
    <div style={{ fontFamily: "Arial, sans-serif", maxWidth: 1200, width: "100%", minWidth: 0, margin: "0 auto", padding: 16, color: "#1A1A2E", background: "white", minHeight: "100vh", boxSizing: "border-box" }}>
      <div style={{ background: ROJO, color: "white", padding: "16px 20px", borderRadius: 10, marginBottom: 14, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0, overflow: "hidden", boxShadow: "0 2px 6px rgba(0,0,0,0.25)" }}>
          <Image src="/logo.jpg" alt="Logo El Nuevo Rural" width={46} height={46} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        <div style={{ flex: "1 1 180px", minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: 0.3 }}>EL NUEVO RURAL</h1>
          <p style={{ margin: "2px 0 0", fontSize: 13, opacity: 0.85 }}>Carnicería · Desposte, escandallo, precio y gastos</p>
        </div>
        <Link href="/" style={{ color: "white", fontSize: 13, fontWeight: 700, opacity: 0.9 }}>
          ← Volver
        </Link>
      </div>

      {faltaMigracion ? (
        <div style={{ background: "#FDEBD0", color: "#784212", padding: "14px 16px", borderRadius: 8, fontSize: 14 }} data-test="falta-migracion">
          <strong>Falta crear las tablas en la base.</strong> Hay que pegar <code>supabase/020_carniceria.sql</code> en el
          editor SQL de Supabase y recargar esta página.
        </div>
      ) : (
        <CarniceriaVista
          parametrosIniciales={parametros}
          cortesIniciales={cortes}
          gastosIniciales={gastos}
          mediasIniciales={medias}
          polloInicial={pollo}
          faltaMigracionPollo={faltaMigracionPollo}
          handlers={handlers}
        />
      )}
    </div>
  );
}
