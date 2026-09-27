import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { esTablaInexistente } from "@/lib/registros/errores";
import { CONFIG_INICIAL, type ConfigFlyer } from "@/lib/ofertas/flyer";
import AdminShell, { type VistaOfertas } from "./AdminShell";
import type { Asignacion, Pantalla, Placa } from "@/lib/cartel/types";

const VISTAS: VistaOfertas[] = ["ofertas", "televisores", "flyer"];

export const dynamic = "force-dynamic";

export default async function CartelAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>;
}) {
  // /cartel/admin?vista=flyer abre directo en el flyer: es a donde lleva el viejo /flyer.
  const { vista } = await searchParams;
  const vistaInicial = VISTAS.find((v) => v === vista) ?? "ofertas";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // A diferencia de la pantalla del televisor, acá se listan también las placas
  // apagadas: son las que hay que poder volver a prender.
  const [{ data, error }, { data: dPantallas, error: ePantallas }, { data: dAsig }, { data: dConfig, error: eConfig }] =
    await Promise.all([
      supabase.from("cartel_placas").select("*").order("orden", { ascending: true }),
      supabase.from("cartel_pantallas").select("slug, nombre, seccion, activa, orden"),
      supabase.from("cartel_placa_pantalla").select("placa_id, pantalla_slug"),
      supabase.from("flyer_config").select("titulo, seccion, vigencia, direccion, telefono, horarios, instagram").eq("id", 1).maybeSingle(),
    ]);

  // Sin la migración 023 no hay flyer_config ni en_flyer: el TV sigue igual y la pestaña del
  // flyer avisa qué falta, en vez de romper el módulo entero.
  const faltaMigracionFlyer = esTablaInexistente(eConfig?.code);
  const configFlyer: ConfigFlyer = { ...CONFIG_INICIAL, ...((dConfig as ConfigFlyer | null) ?? {}) };

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
      configFlyerInicial={configFlyer}
      faltaMigracionFlyer={faltaMigracionFlyer}
      vistaInicial={vistaInicial}
    />
  );
}
