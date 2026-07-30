/*
 * Consulta de los registros de sociedades copiados en Supabase.
 *
 * A diferencia del BCRA, que se consulta contra su API en vivo, esto sale de tablas propias:
 * los datasets oficiales no tienen API ni CORS (ver SPEC-registros.md).
 */

import { createClient } from "@/lib/supabase/client";
import type { Persona, Sociedad } from "./sociedad";

export type ResultadoRegistro =
  | { estado: "ok"; sociedad: Sociedad | null; personas: Persona[] }
  | { estado: "sinTablas" }
  | { estado: "error"; mensaje: string };

/** Postgres avisa así que la tabla todavía no existe (falta correr la migración 009). */
const TABLA_INEXISTENTE = "42P01";

export async function consultarRegistroSociedad(cuit: string): Promise<ResultadoRegistro> {
  const sb = createClient();
  try {
    const { data: soc, error: errSoc } = await sb
      .from("sociedades")
      .select("cuit, razon_social, tipo_societario, fecha_contrato, provincia, localidad, actividad, periodo_fuente")
      .eq("cuit", cuit)
      .maybeSingle();

    if (errSoc) {
      if (errSoc.code === TABLA_INEXISTENTE) return { estado: "sinTablas" };
      return { estado: "error", mensaje: "No se pudo consultar el registro de sociedades." };
    }

    const { data: per, error: errPer } = await sb
      .from("sociedad_personas")
      .select("nombre, rol, tipo_documento, numero_documento")
      .eq("cuit", cuit);

    if (errPer && errPer.code === TABLA_INEXISTENTE) return { estado: "sinTablas" };

    return {
      estado: "ok",
      sociedad: (soc as Sociedad | null) ?? null,
      personas: (per as Persona[] | null) ?? [],
    };
  } catch {
    return { estado: "error", mensaje: "No se pudo consultar el registro de sociedades." };
  }
}
