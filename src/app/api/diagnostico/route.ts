import { NextResponse } from "next/server";

/**
 * Ruta TEMPORAL de diagnóstico. Mide, desde el servidor de Vercel, cuánto
 * tarda en responder cada servicio de Supabase. Sirve para distinguir un
 * problema de la app de uno de conectividad con la base.
 *
 * No devuelve datos ni claves: solo tiempos y códigos de estado.
 * Borrar cuando termine la investigación.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function medir(nombre: string, path: string, metodo = "GET") {
  const inicio = Date.now();
  try {
    const r = await fetch(`${url}${path}`, {
      method: metodo,
      headers: {
        apikey: anon!,
        Authorization: `Bearer ${anon}`,
        ...(metodo === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      ...(metodo === "POST"
        ? { body: JSON.stringify({ email: "nadie@ejemplo.invalid", password: "x" }) }
        : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    // Consumimos el cuerpo para medir la respuesta completa, pero no lo
    // devolvemos: solo interesa cuánto tardó y con qué código contestó.
    const cuerpo = await r.text();
    return { nombre, ms: Date.now() - inicio, status: r.status, bytes: cuerpo.length };
  } catch (e) {
    return { nombre, ms: Date.now() - inicio, error: (e as Error).name };
  }
}

export async function GET() {
  const pruebas = [];

  // Dos vueltas, para distinguir una caída sostenida de un pico puntual.
  for (const vuelta of [1, 2]) {
    pruebas.push(
      ...(await Promise.all([
        medir(`auth/health #${vuelta}`, "/auth/v1/health"),
        medir(`auth/settings #${vuelta}`, "/auth/v1/settings"),
        medir(`auth/user #${vuelta}`, "/auth/v1/user"),
        medir(`auth/token (login) #${vuelta}`, "/auth/v1/token?grant_type=password", "POST"),
        medir(`auth/ruta-inexistente #${vuelta}`, "/auth/v1/no-existe-esto"),
        medir(`rest/usuarios #${vuelta}`, "/rest/v1/usuarios?select=id&limit=1"),
      ])),
    );
  }

  return NextResponse.json(
    { region: process.env.VERCEL_REGION ?? "desconocida", pruebas },
    { headers: { "Cache-Control": "no-store" } },
  );
}
