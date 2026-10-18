import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CartelPantalla from "../../CartelPantalla";
import { rotacionDe } from "@/lib/cartel/placas";
import type { Asignacion, Pantalla, Placa } from "@/lib/cartel/types";

// El televisor tiene que ver siempre las ofertas de ahora, nunca un HTML
// cacheado de hace horas.
export const dynamic = "force-dynamic";

/**
 * La pantalla de un televisor concreto: /cartel/tv/carniceria-1
 *
 * Es la dirección que se tipea en el navegador del TV, así que es pública igual
 * que /cartel. El middleware la deja pasar por patrón, no abriendo el prefijo
 * /cartel/, para que /cartel/admin siga pidiendo login.
 */
export default async function CartelTvPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ fijo?: string; rotar?: string }>;
}) {
  const { slug } = await params;
  const { fijo, rotar } = await searchParams;

  // ?fijo=N congela la pantalla en una placa, para que el generador de video
  // capture cada una de forma reproducible. Igual que en /cartel.
  const indiceFijo = fijo != null && fijo !== "" && Number.isFinite(Number(fijo)) ? Number(fijo) : null;

  let pantalla: Pantalla | null = null;
  let placas: Placa[] = [];
  let asignaciones: Asignacion[] = [];

  // notFound() se llama fuera del try a propósito: funciona tirando una
  // excepción que Next atrapa más arriba, y este catch se la comería.
  try {
    const supabase = await createClient();

    // maybeSingle y no single: un slug inexistente tiene que ser un 404
    // tranquilo, no un error.
    const { data: fila, error: ePantalla } = await supabase
      .from("cartel_pantallas")
      .select("slug, nombre, seccion, activa, orden")
      .eq("slug", slug)
      .eq("activa", true)
      .maybeSingle();

    // Sin la migración 016 aplicada la tabla no existe. Dejar que eso termine en
    // 404 es más honesto que mostrar el cartel genérico: así se nota que falta
    // aplicar la migración, en vez de creer que la pantalla está configurada.
    if (ePantalla) console.error("cartel/tv: no se pudo leer la pantalla:", ePantalla.message);

    if (fila) {
      pantalla = fila as Pantalla;

      const [{ data: dPlacas, error: ePlacas }, { data: dAsig, error: eAsig }] = await Promise.all([
        supabase.from("cartel_placas").select("*").eq("activa", true).order("orden", { ascending: true }),
        supabase.from("cartel_placa_pantalla").select("placa_id, pantalla_slug"),
      ]);

      // Un error acá no justifica tirar la pantalla abajo: sin placas el
      // reproductor cae a las de demostración y el televisor muestra algo.
      if (ePlacas) console.error("cartel/tv: no se pudieron leer las placas:", ePlacas.message);
      if (eAsig) console.error("cartel/tv: no se pudieron leer las asignaciones:", eAsig.message);

      placas = (dPlacas ?? []) as Placa[];
      asignaciones = (dAsig ?? []) as Asignacion[];
    }
  } catch (e) {
    console.error("cartel/tv: falló la conexión con Supabase:", e);
  }

  if (!pantalla) notFound();

  return (
    <CartelPantalla
      placasIniciales={placas}
      asignacionesIniciales={asignaciones}
      pantalla={pantalla}
      indiceFijo={indiceFijo}
      // ?rotar=90 o 270 para los TVs montados parados (SPEC-cartel-tv-en-vivo.md).
      rotar={rotacionDe(rotar)}
      // Vercel lo define en cada deploy; en la compu de desarrollo no existe.
      version={process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local"}
    />
  );
}
