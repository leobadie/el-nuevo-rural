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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function medir(nombre: string, path: string) {
  const inicio = Date.now();
  try {
    const r = await fetch(`${url}${path}`, {
      headers: { apikey: anon!, Authorization: `Bearer ${anon}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    // Consumimos el cuerpo para medir la respuesta completa, pero no lo
    // devolvemos: solo interesa cuánto tardó y con qué código contestó.
    const cuerpo = await r.text();
    return { nombre, ms: Date.now() - inicio, status: r.status, bytes: cuerpo.length };
  } catch (e) {
    return { nombre, ms: Date.now() - inicio, error: (e as Error).name + ": " + (e as Error).message };
  }
}

export async function GET() {
  const configurado = { url: Boolean(url), anon: Boolean(anon) };

  const pruebas = await Promise.all([
    medir("auth", "/auth/v1/health"),
    medir("base (consulta trivial)", "/rest/v1/usuarios?select=id&limit=1"),
    medir("base (tabla cheques)", "/rest/v1/cheques?select=id&limit=1"),
  ]);

  return NextResponse.json(
    { configurado, region: process.env.VERCEL_REGION ?? "desconocida", pruebas },
    { headers: { "Cache-Control": "no-store" } },
  );
}
