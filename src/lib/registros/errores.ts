/*
 * Los dos códigos con que puede llegar "la tabla todavía no existe" (falta correr la migración
 * 009). PostgREST, que es lo que le responde a la app, contesta 404 con PGRST205 ("no está en
 * el schema cache"); 42P01 es el de Postgres y aparece si el error viene del motor.
 *
 * Sin el de PostgREST, la pantalla mostraba en rojo "No se pudo consultar el registro de
 * sociedades", que se lee como que algo se rompió cuando en realidad el dato todavía no se
 * cargó: en ese caso no hay que mostrar nada.
 *
 * Va en su propio archivo, sin importar el cliente de Supabase, para que verificacion/ pueda
 * probarlo con node suelto (que no resuelve el alias "@/").
 */
const TABLA_INEXISTENTE = ["42P01", "PGRST205"];

/** Si el error es que la tabla no existe todavía, y no una falla real de la consulta. */
export function esTablaInexistente(codigo: string | undefined | null): boolean {
  return !!codigo && TABLA_INEXISTENTE.includes(codigo);
}
