import { createClient } from "@/lib/supabase/server";
import CartelPantalla from "./CartelPantalla";
import type { Placa } from "@/lib/cartel/types";

// El televisor tiene que ver siempre las ofertas de ahora, nunca un HTML
// cacheado de hace horas.
export const dynamic = "force-dynamic";

export default async function CartelPage({
  searchParams,
}: {
  searchParams: Promise<{ fijo?: string; seccion?: string }>;
}) {
  // ?fijo=N congela la pantalla en una placa concreta, sin rotar. Lo usa el
  // generador de video para capturar cada placa de forma reproducible, en vez
  // de sacar screenshots a ciegas esperando que la rotación caiga justo.
  // ?seccion=carniceria deja en pantalla solo lo de ese sector (más lo que no
  // tiene sección, que sirve para todo el local). Es lo que permite generar un
  // archivo distinto para el TV de la carnicería y para el de la entrada.
  const { fijo, seccion } = await searchParams;
  const indiceFijo = fijo != null && fijo !== "" && Number.isFinite(Number(fijo)) ? Number(fijo) : null;

  let placas: Placa[] = [];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("cartel_placas")
      .select("*")
      .eq("activa", true)
      .order("orden", { ascending: true });

    if (error) {
      // Sin la migración aplicada la tabla no existe todavía. No es motivo para
      // romper la pantalla: abajo se cae a las placas de demostración.
      console.error("cartel: no se pudieron leer las placas:", error.message);
    }
    placas = (data ?? []) as Placa[];
  } catch (e) {
    console.error("cartel: falló la conexión con Supabase:", e);
  }

  return (
    <CartelPantalla
      placasIniciales={placas}
      indiceFijo={indiceFijo}
      seccion={seccion?.trim() || null}
    />
  );
}
