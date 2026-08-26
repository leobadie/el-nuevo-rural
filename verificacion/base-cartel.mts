/*
 * Verificación de que la migración 014 quedó bien aplicada en Supabase: la tabla,
 * el bucket y —lo que más importa— que las políticas de RLS hagan exactamente lo
 * que el cartel necesita: que el televisor pueda leer sin sesión, pero que nadie
 * pueda escribir desde afuera ni ver las placas apagadas.
 *
 * Uso: npm run verificar:base-cartel   (después de pegar supabase/014 en el editor SQL)
 *
 * Usa la service_role key para preparar los datos de prueba, y la anon key para
 * comprobar qué ve realmente alguien sin login. Corre en la máquina del usuario,
 * nunca en la app.
 *
 * Las filas de prueba que crea se borran al final, pasen o fallen los checks.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let fallos = 0;
function ok(cond: boolean, desc: string, detalle: string | number = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${desc}${detalle !== "" ? `  → ${detalle}` : ""}`);
  if (!cond) fallos++;
}

function leerEnv(): Record<string, string> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  const archivo = path.join(process.cwd(), ".env.local");
  for (const linea of fs.readFileSync(archivo, "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = leerEnv();
if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.error("Faltan SUPABASE_SERVICE_ROLE_KEY o NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local.");
  process.exit(2);
}

const { createClient } = require("@supabase/supabase-js");
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
// Este cliente es el televisor: sin sesión, igual que /cartel abierto en el TV.
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const MARCA = "__PRUEBA_CLAUDE__";
let idActiva: string | null = null;
let idApagada: string | null = null;

async function limpiar() {
  await admin.from("cartel_placas").delete().like("titulo", `${MARCA}%`);
}

try {
  console.log("=== R1 — La tabla existe y se puede leer ===");
  const { error: eLectura, count } = await admin
    .from("cartel_placas")
    .select("*", { count: "exact", head: true });
  ok(!eLectura, "cartel_placas existe", eLectura?.message ?? `${count} fila(s) hoy`);

  if (eLectura) {
    console.log("\nLa tabla no está: pegá supabase/014_cartel.sql en el editor SQL de Supabase.");
    process.exit(1);
  }

  console.log("\n=== R2 — Preparo una placa encendida y una apagada ===");
  const { data: creadas, error: eInsert } = await admin
    .from("cartel_placas")
    .insert([
      { titulo: `${MARCA} activa`, tipo: "oferta", precio: 1234, activa: true, orden: 9001 },
      { titulo: `${MARCA} apagada`, tipo: "aviso", activa: false, orden: 9002 },
    ])
    .select();

  ok(!eInsert && creadas?.length === 2, "se pudieron crear las placas de prueba", eInsert?.message);
  idActiva = creadas?.find((p: any) => p.titulo.endsWith("activa"))?.id ?? null;
  idApagada = creadas?.find((p: any) => p.titulo.endsWith("apagada"))?.id ?? null;

  console.log("\n=== R3 — El televisor (sin sesión) ve las placas activas ===");
  const { data: vistas, error: eAnon } = await anon
    .from("cartel_placas")
    .select("id, titulo, activa")
    .like("titulo", `${MARCA}%`);

  ok(!eAnon, "la lectura anónima no da error", eAnon?.message);
  ok(
    !!vistas?.some((p: any) => p.id === idActiva),
    "ve la placa encendida (si no, el TV queda sin ofertas)",
    `devolvió ${vistas?.length ?? 0} fila(s)`,
  );

  console.log("\n=== R4 — Pero no ve las apagadas ===");
  ok(
    !vistas?.some((p: any) => p.id === idApagada),
    "la placa apagada no se filtra a quien no tiene sesión",
  );

  console.log("\n=== R5 — Nadie puede escribir sin sesión ===");
  const { error: eEscritura } = await anon
    .from("cartel_placas")
    .insert({ titulo: `${MARCA} intrusa`, tipo: "aviso" });
  ok(!!eEscritura, "el insert anónimo es rechazado", eEscritura?.message ?? "¡ENTRÓ! revisá las políticas");

  const { data: trasBorrado } = await anon.from("cartel_placas").delete().eq("id", idActiva!).select();
  ok((trasBorrado?.length ?? 0) === 0, "el delete anónimo no borra nada");

  console.log("\n=== R6 — Ninguna otra tabla quedó abierta al público ===");
  for (const tabla of ["cheques", "movimientos", "colaboradores", "usuarios"]) {
    const { data, error } = await anon.from(tabla).select("*").limit(1);
    ok(!!error || (data?.length ?? 0) === 0, `${tabla} sigue cerrada sin sesión`, error?.code ?? "0 filas");
  }

  console.log("\n=== R7 — La vigencia al revés se rechaza en la base ===");
  const { error: eVigencia } = await admin.from("cartel_placas").insert({
    titulo: `${MARCA} imposible`,
    vigencia_desde: "2026-09-10",
    vigencia_hasta: "2026-09-01",
  });
  ok(!!eVigencia, "no deja cargar una placa que no se vería nunca", eVigencia?.message?.slice(0, 60));

  console.log("\n=== R8 — actualizado_el se mueve solo al editar ===");
  const { data: antes } = await admin
    .from("cartel_placas")
    .select("actualizado_el")
    .eq("id", idActiva!)
    .single();

  await new Promise((r) => setTimeout(r, 1100));
  await admin.from("cartel_placas").update({ precio: 4321 }).eq("id", idActiva!);

  const { data: despues } = await admin
    .from("cartel_placas")
    .select("actualizado_el")
    .eq("id", idActiva!)
    .single();

  ok(
    new Date(despues!.actualizado_el).getTime() > new Date(antes!.actualizado_el).getTime(),
    "el trigger actualizó la marca de tiempo",
  );

  console.log("\n=== R9 — El bucket de fotos existe y es público ===");
  const { data: buckets, error: eBuckets } = await admin.storage.listBuckets();
  const cartel = buckets?.find((b: any) => b.id === "cartel");
  ok(!eBuckets && !!cartel, "existe el bucket 'cartel'", eBuckets?.message);
  ok(!!cartel?.public, "el bucket es público (si no, el TV no ve las fotos)");
} finally {
  await limpiar();
}

console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} CHECK(S) FALLARON`}`);
process.exit(fallos === 0 ? 0 : 1);
