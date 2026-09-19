import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generarFlyer } from "@/lib/flyer/generar";
import { esFormato } from "@/lib/flyer/calculos";
import type { Flyer, FormatoFlyer } from "@/lib/flyer/tipos";

/*
 * Devuelve el PNG del flyer (SPEC-flyer.md R2). Va por POST y no por GET porque el flyer
 * entero —hasta seis productos con textos y direcciones de fotos— no entra cómodo en una URL.
 */

/** `readFile` de las tipografías necesita el runtime de Node, no el de edge. */
export const runtime = "nodejs";

const error = (mensaje: string, status: number) => Response.json({ error: mensaje }, { status });

export async function POST(request: NextRequest) {
  // R2.2: es una ruta de la app, no un generador de imágenes abierto. El proxy ya manda a
  // /login a quien no tiene sesión; esto lo vuelve a chequear por las dudas de que cambie.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return error("Hay que iniciar sesión para generar el flyer.", 401);

  let cuerpo: { flyer?: Flyer; formato?: FormatoFlyer };
  try {
    cuerpo = await request.json();
  } catch {
    return error("No se entendió el pedido.", 400);
  }

  const { flyer, formato } = cuerpo;
  if (!esFormato(formato)) return error("Formato desconocido.", 400);
  if (!flyer || typeof flyer !== "object") return error("Falta el flyer.", 400);

  // Satori no resuelve rutas relativas: el logo va con la dirección completa de este servidor.
  return generarFlyer(flyer, formato, new URL("/logo.jpg", request.nextUrl.origin).toString());
}
