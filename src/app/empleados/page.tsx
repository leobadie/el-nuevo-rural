import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EmpleadosShell from "./EmpleadosShell";
import type { Colaborador, ParametrosEmpleados, RegistroAsistencia } from "@/lib/empleados/types";

const PARAMETROS_DEFAULT: ParametrosEmpleados = {
  horas_completa: 10.75,
  horas_media: 5.38,
  recargo_50: 0.5,
  recargo_100: 1.0,
};

export default async function EmpleadosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: perfil } = await supabase
    .from("usuarios")
    .select("rol")
    .eq("id", user.id)
    .maybeSingle();

  const [colaboradoresRes, registrosRes, parametrosRes] = await Promise.all([
    supabase.from("colaboradores").select("*").order("nombre", { ascending: true }),
    supabase.from("registros_asistencia").select("*"),
    supabase.from("parametros_empleados").select("*").maybeSingle(),
  ]);

  return (
    <EmpleadosShell
      esAdmin={perfil?.rol === "admin"}
      colaboradoresIniciales={(colaboradoresRes.data ?? []) as Colaborador[]}
      registrosIniciales={(registrosRes.data ?? []) as RegistroAsistencia[]}
      parametrosIniciales={(parametrosRes.data as ParametrosEmpleados | null) ?? PARAMETROS_DEFAULT}
    />
  );
}
