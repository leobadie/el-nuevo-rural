import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RentabilidadShell from "./RentabilidadShell";
import type { Colaborador, ParametrosEmpleados, RegistroAsistencia } from "@/lib/empleados/types";
import type { Movimiento, VentaXRP } from "@/lib/ingresos-egresos/types";

const PARAMETROS_DEFAULT: ParametrosEmpleados = {
  horas_completa: 10.75,
  horas_media: 5.38,
  recargo_50: 0.5,
  recargo_100: 1.0,
};

export default async function RentabilidadPage() {
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

  if (perfil?.rol !== "admin") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center bg-gray-50 px-4 text-center">
        <p className="text-lg font-semibold text-gray-900">Acceso restringido</p>
        <p className="mt-1 text-sm text-gray-500">Esta sección es solo para administradores.</p>
        <Link href="/" className="mt-4 text-sm font-medium text-green-700 hover:underline">
          ← Volver al inicio
        </Link>
      </main>
    );
  }

  const [movsRes, ventasXRPRes, colaboradoresRes, registrosRes, parametrosRes] = await Promise.all([
    supabase.from("movimientos").select("*"),
    supabase.from("ventas_xrp").select("*"),
    supabase.from("colaboradores").select("*"),
    supabase.from("registros_asistencia").select("*"),
    supabase.from("parametros_empleados").select("*").maybeSingle(),
  ]);

  return (
    <RentabilidadShell
      movimientos={(movsRes.data ?? []) as Movimiento[]}
      ventasXRP={(ventasXRPRes.data ?? []) as VentaXRP[]}
      colaboradores={(colaboradoresRes.data ?? []) as Colaborador[]}
      registros={(registrosRes.data ?? []) as RegistroAsistencia[]}
      parametros={(parametrosRes.data as ParametrosEmpleados | null) ?? PARAMETROS_DEFAULT}
    />
  );
}
