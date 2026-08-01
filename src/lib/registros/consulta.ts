/*
 * Consulta de los registros de sociedades copiados en Supabase.
 *
 * A diferencia del BCRA, que se consulta contra su API en vivo, esto sale de tablas propias:
 * los datasets oficiales no tienen API ni CORS (ver SPEC-registros.md).
 */

import { createClient } from "@/lib/supabase/client";
import { esTablaInexistente } from "./errores";
import type { Persona, Sociedad } from "./sociedad";

export type ResultadoRegistro =
  | { estado: "ok"; sociedad: Sociedad | null; personas: Persona[] }
  | { estado: "sinTablas" }
  /* Las tablas están, pero esta sesión no ve ni una fila: no se puede afirmar nada del CUIT. */
  | { estado: "sinAcceso" }
  | { estado: "error"; mensaje: string };

/**
 * ¿La consulta vino vacía porque el CUIT no está, o porque esta sesión no ve la tabla?
 *
 * RLS no devuelve un error cuando filtra: devuelve una lista vacía, igual que un CUIT que no
 * existe. Sin distinguirlos, un usuario sin permiso —o las tablas creadas pero todavía sin
 * importar— hacían que la pantalla dijera "este CUIT no figura en el Registro Nacional de
 * Sociedades" sobre una empresa que sí está cargada. Eso es afirmar algo falso sobre quien te
 * está por dar un cheque, que es exactamente lo que R3.3 prohíbe.
 *
 * El orden de los dos controles importa y es lo que evita un problema de rendimiento: sin
 * sesión, `select … limit 1` no puede cortar en la primera fila —ninguna pasa el filtro de
 * RLS— y Postgres termina evaluando la política sobre las 1.251.568, se pasa del timeout y
 * devuelve 500. Mirar la sesión primero es local, no toca la base, y deja esa consulta solo
 * para el caso en que sí hay permiso, donde corta en la primera fila.
 */
async function puedeVerElRegistro(sb: ReturnType<typeof createClient>): Promise<boolean> {
  const { data: sesion } = await sb.auth.getSession();
  if (!sesion.session) return false;
  const { data, error } = await sb.from("sociedades").select("cuit").limit(1);
  return !error && (data?.length ?? 0) > 0;
}

export async function consultarRegistroSociedad(cuit: string): Promise<ResultadoRegistro> {
  const sb = createClient();
  try {
    const { data: soc, error: errSoc } = await sb
      .from("sociedades")
      .select("cuit, razon_social, tipo_societario, fecha_contrato, provincia, localidad, actividad, periodo_fuente")
      .eq("cuit", cuit)
      .maybeSingle();

    if (errSoc) {
      if (esTablaInexistente(errSoc.code)) return { estado: "sinTablas" };
      return { estado: "error", mensaje: "No se pudo consultar el registro de sociedades." };
    }

    const { data: per, error: errPer } = await sb
      .from("sociedad_personas")
      .select("nombre, rol, tipo_documento, numero_documento")
      .eq("cuit", cuit);

    if (errPer && esTablaInexistente(errPer.code)) return { estado: "sinTablas" };

    if (!soc && !(await puedeVerElRegistro(sb))) return { estado: "sinAcceso" };

    return {
      estado: "ok",
      sociedad: (soc as Sociedad | null) ?? null,
      personas: (per as Persona[] | null) ?? [],
    };
  } catch {
    return { estado: "error", mensaje: "No se pudo consultar el registro de sociedades." };
  }
}
