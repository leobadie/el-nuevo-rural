import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { esTablaInexistente } from "@/lib/registros/errores";
import MunicipalidadShell from "./MunicipalidadShell";
import type { CobroMunicipalidad, FacturaMunicipalidad, ImputacionCobro } from "@/lib/municipalidad/types";

export default async function MunicipalidadPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: perfil } = await supabase.from("usuarios").select("rol").eq("id", user.id).maybeSingle();

  const [facturasRes, cobrosRes, imputacionesRes] = await Promise.all([
    supabase.from("facturas_municipalidad").select("*").order("fecha_entrega", { ascending: true }),
    supabase.from("cobros_municipalidad").select("*").order("fecha", { ascending: true }),
    supabase.from("imputaciones_cobro_municipalidad").select("*").order("creado_el", { ascending: true }),
  ]);

  // Sin la migración 018 las tres consultas fallan con "tabla inexistente": mejor decirlo que
  // mostrar una pantalla en cero que parece que la Municipalidad no debe nada.
  const faltaMigracion = [facturasRes, cobrosRes, imputacionesRes].some((r) => esTablaInexistente(r.error?.code));

  return (
    <MunicipalidadShell
      esAdmin={perfil?.rol === "admin"}
      userId={user.id}
      faltaMigracion={faltaMigracion}
      facturasIniciales={(facturasRes.data ?? []) as FacturaMunicipalidad[]}
      cobrosIniciales={(cobrosRes.data ?? []) as CobroMunicipalidad[]}
      imputacionesIniciales={(imputacionesRes.data ?? []) as ImputacionCobro[]}
    />
  );
}
