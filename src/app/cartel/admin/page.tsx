import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminShell from "./AdminShell";
import type { Asignacion, Pantalla, Placa } from "@/lib/cartel/types";

export const dynamic = "force-dynamic";

export default async function CartelAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // A diferencia de la pantalla del televisor, acá se listan también las placas
  // apagadas: son las que hay que poder volver a prender.
  const [{ data, error }, { data: dPantallas, error: ePantallas }, { data: dAsig }] =
    await Promise.all([
      supabase.from("cartel_placas").select("*").order("orden", { ascending: true }),
      supabase.from("cartel_pantallas").select("slug, nombre, seccion, activa, orden"),
      supabase.from("cartel_placa_pantalla").select("placa_id, pantalla_slug"),
    ]);

  // Si falta la migración 016 las pantallas no existen todavía. El admin de
  // placas tiene que seguir funcionando igual: lo de los televisores aparece
  // vacío y el error se muestra arriba, en vez de tumbar la pantalla entera.
  if (ePantallas) console.error("cartel/admin: no se pudieron leer las pantallas:", ePantallas.message);

  return (
    <AdminShell
      placasIniciales={(data ?? []) as Placa[]}
      pantallasIniciales={(dPantallas ?? []) as Pantalla[]}
      asignacionesIniciales={(dAsig ?? []) as Asignacion[]}
      userId={user.id}
      errorInicial={error?.message ?? null}
    />
  );
}
