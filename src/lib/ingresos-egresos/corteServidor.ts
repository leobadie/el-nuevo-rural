import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * El corte de registros de Ingresos y Egresos (SPEC-corte-registros.md), o null si no hay.
 * Sin la migración 024 la tabla no existe y se ve todo, como antes: un error acá no puede
 * dejar la caja en blanco.
 */
export async function leerCorteIE(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.from("config_ingresos_egresos").select("corte").eq("id", true).maybeSingle();
  if (error) return null;
  return (data as { corte: string | null } | null)?.corte ?? null;
}
