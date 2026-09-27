import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { esTablaInexistente } from "@/lib/registros/errores";
import { normalizarCorte, normalizarMedia, normalizarPollo } from "@/lib/carniceria/normalizar";
import type { Corte, GastoCarniceria, IngresoPollo, MediaRes, Parametros } from "@/lib/carniceria/types";
import type { GastoFijo } from "@/lib/ingresos-egresos/types";
import CarniceriaShell from "./CarniceriaShell";

export default async function CarniceriaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: perfil } = await supabase.from("usuarios").select("rol").eq("id", user.id).maybeSingle();

  // Muestra costos y márgenes: solo admin, igual que Rentabilidad (SPEC 12).
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

  const [parametrosRes, cortesRes, mediasRes, incluidosRes, gastosFijosRes, polloRes] = await Promise.all([
    supabase.from("carniceria_parametros").select("clave, valor"),
    supabase.from("carniceria_cortes").select("*").order("orden", { ascending: true }),
    supabase.from("carniceria_medias_reses").select("*").order("fecha", { ascending: true }),
    supabase.from("carniceria_gastos_fijos").select("gasto_fijo_id, incluido"),
    supabase.from("gastos_fijos").select("*").eq("activo", true).order("descripcion", { ascending: true }),
    supabase.from("carniceria_pollo").select("*").order("fecha", { ascending: true }),
  ]);

  // Sin la migración 020 las consultas fallan con "tabla inexistente": mejor decirlo que mostrar
  // las calculadoras con el ejemplo y que al cargar algo no se guarde nada.
  const faltaMigracion = [parametrosRes, cortesRes, mediasRes, incluidosRes].some((r) => esTablaInexistente(r.error?.code));

  // El pollo vino después (021): si falta, se avisa sólo en su sección y el resto funciona.
  const faltaMigracionPollo = esTablaInexistente(polloRes.error?.code);

  const parametros: Parametros = {};
  for (const fila of (parametrosRes.data ?? []) as { clave: string; valor: number | string }[]) {
    parametros[fila.clave] = Number(fila.valor);
  }

  // Un gasto fijo sin fila en carniceria_gastos_fijos cuenta (SPEC 7).
  const incluido = new Map(((incluidosRes.data ?? []) as { gasto_fijo_id: string; incluido: boolean }[]).map((x) => [x.gasto_fijo_id, x.incluido]));
  const gastos: GastoCarniceria[] = ((gastosFijosRes.data ?? []) as GastoFijo[]).map((g) => ({
    id: g.id,
    descripcion: g.descripcion,
    categoria: g.categoria,
    monto: Number(g.monto),
    incluido: incluido.get(g.id) ?? true,
  }));

  return (
    <CarniceriaShell
      userId={user.id}
      faltaMigracion={faltaMigracion}
      faltaMigracionPollo={faltaMigracionPollo}
      parametros={parametros}
      cortes={((cortesRes.data ?? []) as Corte[]).map(normalizarCorte)}
      gastos={gastos}
      medias={((mediasRes.data ?? []) as MediaRes[]).map(normalizarMedia)}
      pollo={((polloRes.data ?? []) as IngresoPollo[]).map(normalizarPollo)}
    />
  );
}
