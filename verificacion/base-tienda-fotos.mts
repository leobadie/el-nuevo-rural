/*
 * Verificación de la migración 034 (fotos sugeridas) contra Supabase (SPEC-tienda-fotos.md,
 * req. 1–5): sin login no se ve nada ni se puede decidir, y las restricciones de la tabla.
 * Aceptar/descartar con un usuario real se prueba en el navegador (necesita sesión).
 *
 * Uso: npm run verificar:base-tienda-fotos   (después de pegar supabase/034_tienda_fotos.sql)
 *
 * Crea un producto y una sugerencia de prueba (marca ZZ-PRUEBA-FOTO) y los borra al final.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let fallos = 0;
function ok(cond: boolean, desc: string, detalle: unknown = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${desc}${detalle !== "" ? `  → ${typeof detalle === "string" ? detalle : JSON.stringify(detalle)}` : ""}`);
  if (!cond) fallos++;
}
function leerEnv(): Record<string, string> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  for (const linea of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}
const env = leerEnv();
const { createClient } = require("@supabase/supabase-js");
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const COD = "ZZ-PRUEBA-FOTO";
const URL_FOTO = "https://example.org/zz-prueba.jpg";

async function limpiar() {
  await admin.from("tienda_productos").delete().eq("codigo_xrp", COD); // cascada: sugerencias y búsquedas
}

async function main() {
  await limpiar();
  const col = await admin.from("tienda_productos").select("foto_credito").limit(1);
  if (col.error) {
    console.error(`Falta la migración 034: ${col.error.message}`);
    process.exit(2);
  }
  ok(true, "Existe tienda_productos.foto_credito");

  const prod = await admin
    .from("tienda_productos")
    .insert({ codigo_xrp: COD, nombre_xrp: "Prueba foto", precio_centavos: 1000, se_vende_por: "unidad", busqueda: "prueba" })
    .select("id")
    .single();
  if (prod.error) throw new Error(prod.error.message);
  const pid = prod.data.id;

  const sug = await admin
    .from("tienda_fotos_sugeridas")
    .insert({ producto_id: pid, url: URL_FOTO, url_origen: "https://images.openfoodfacts.org/x.400.jpg", nombre_origen: "Prueba" })
    .select("id, estado, credito")
    .single();
  ok(!sug.error && sug.data.estado === "pendiente", "Una sugerencia nueva queda pendiente", sug.error?.message ?? sug.data);
  ok(sug.data?.credito === "Open Food Facts (CC BY-SA)", "Lleva el crédito de Open Food Facts por defecto");

  const dup = await admin.from("tienda_fotos_sugeridas").insert({ producto_id: pid, url: URL_FOTO, url_origen: "x" });
  ok(!!dup.error, "Una sola sugerencia por producto y fuente");
  const http = await admin.from("tienda_fotos_sugeridas").update({ url: "http://inseguro.org/a.jpg" }).eq("id", sug.data.id);
  ok(!!http.error, "La foto guardada tiene que ser https");
  const incoherente = await admin.from("tienda_fotos_sugeridas").update({ estado: "aceptada" }).eq("id", sug.data.id);
  ok(!!incoherente.error, "No se puede marcar aceptada sin fecha de decisión (sólo por la función)");

  const bus = await admin.from("tienda_fotos_busquedas").insert({ producto_id: pid, resultado: "con_foto" });
  ok(!bus.error, "Se anota la búsqueda", bus.error?.message ?? "");
  const busMal = await admin.from("tienda_fotos_busquedas").upsert({ producto_id: pid, resultado: "quizas" });
  ok(!!busMal.error, "Resultado de búsqueda inválido se rechaza");

  // ---------- sin login ----------
  const verSug = await anon.from("tienda_fotos_sugeridas").select("id");
  ok(!verSug.error && verSug.data.length === 0, "anon no ve sugerencias", verSug.data?.length ?? verSug.error?.message);
  const verBus = await anon.from("tienda_fotos_busquedas").select("producto_id");
  ok(!verBus.error && verBus.data.length === 0, "anon no ve búsquedas");
  const decAnon = await anon.rpc("tienda_decidir_foto", { p_id: sug.data.id, p_aceptar: true });
  ok(!!decAnon.error, "anon no puede aceptar fotos", decAnon.error?.message ?? "");
  const insAnon = await anon.from("tienda_fotos_sugeridas").insert({ producto_id: pid, url: URL_FOTO, url_origen: "x" });
  ok(!!insAnon.error, "anon no puede crear sugerencias");

  // La service_role no es un usuario del sistema: la función también la frena.
  const decAdmin = await admin.rpc("tienda_decidir_foto", { p_id: sug.data.id, p_aceptar: true });
  ok(!!decAdmin.error && decAdmin.error.message.includes("usuario activo"), "Sin usuario activo la función no decide", decAdmin.error?.message ?? "");
  const sigue = await admin.from("tienda_productos").select("foto_url").eq("id", pid).single();
  ok(sigue.data?.foto_url === null, "…y el producto sigue sin foto");

  const borrado = await admin.from("tienda_productos").delete().eq("id", pid);
  const queda = await admin.from("tienda_fotos_sugeridas").select("id", { count: "exact", head: true }).eq("producto_id", pid);
  ok(!borrado.error && queda.count === 0, "Borrar el producto borra sus sugerencias");
}

try {
  await main();
} catch (e) {
  fallos++;
  console.error("ERROR inesperado:", e);
} finally {
  await limpiar();
}
console.log(fallos ? `\n${fallos} check(s) fallaron` : "\nTodos los checks pasaron");
process.exit(fallos ? 1 : 0);
