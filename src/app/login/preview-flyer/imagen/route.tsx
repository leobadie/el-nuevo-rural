import type { NextRequest } from "next/server";
import { generarFlyer } from "@/lib/flyer/generar";
import { esFormato } from "@/lib/flyer/calculos";
import type { Flyer, FormatoFlyer } from "@/lib/flyer/tipos";

/*
 * La misma imagen que /api/flyer, pero sin pedir sesión, para que el verificador de navegador
 * pueda comprobar el PNG de verdad (medidas y que Satori no se rompa). Igual que las páginas
 * de preview: vive bajo /login, que es lo que el proxy deja pasar, y **en producción no
 * existe**, así que no abre un generador público.
 *
 * Usa `generarFlyer`, el mismo de la ruta real: lo que se verifica acá es lo que se descarga.
 */

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }

  let cuerpo: { flyer?: Flyer; formato?: FormatoFlyer };
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "No se entendió el pedido." }, { status: 400 });
  }

  const { flyer, formato } = cuerpo;
  if (!esFormato(formato)) return Response.json({ error: "Formato desconocido." }, { status: 400 });
  if (!flyer || typeof flyer !== "object") return Response.json({ error: "Falta el flyer." }, { status: 400 });

  return generarFlyer(flyer, formato, new URL("/logo.jpg", request.nextUrl.origin).toString());
}
