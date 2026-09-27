/*
 * Supabase devuelve las columnas numeric como texto ("10600.00"). Se pasan a number al leer,
 * una sola vez, para que las cuentas no concatenen strings.
 */
import type { Corte, MediaRes } from "./types";

const n = (x: number | string | null) => (x == null ? null : Number(x));

export function normalizarMedia(m: MediaRes): MediaRes {
  return {
    ...m,
    kg_factura: Number(m.kg_factura),
    precio_kg: Number(m.precio_kg),
    kg_balanza: n(m.kg_balanza),
    dias_camara: n(m.dias_camara),
    hueso_kg: n(m.hueso_kg),
    grasa_kg: n(m.grasa_kg),
    merma_kg: n(m.merma_kg),
    precio_grasero: n(m.precio_grasero),
  };
}

export function normalizarCorte(c: Corte): Corte {
  return { ...c, precio_pizarra: Number(c.precio_pizarra), kilos_desposte: Number(c.kilos_desposte), orden: Number(c.orden) };
}
