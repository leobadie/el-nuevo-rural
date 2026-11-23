/*
 * Verifica contra la base real que la migración 038 (notas de crédito de proveedores) quedó bien
 * aplicada (SPEC-notas-credito.md, puntos 1-4 y 24): tablas, RLS y, sobre todo, que los topes los
 * corta el servidor y no sólo la pantalla.
 *
 * Uso: npm run verificar:base-notas-credito   (después de pegar supabase/038 en el editor SQL)
 *
 * Usa la service_role key (las tablas tienen RLS y el script no tiene sesión). Crea un proveedor
 * de prueba con un nombre imposible de confundir y lo borra al final, pasen o fallen los checks.
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

const env: Record<string, string> = { ...(process.env as Record<string, string>) };
const archivoEnv = [path.join(process.cwd(), ".env.local"), path.join(process.cwd(), "..", "..", "..", ".env.local")].find((p) => fs.existsSync(p));
if (!archivoEnv) {
  console.error("No encontré .env.local.");
  process.exit(2);
}
for (const l of fs.readFileSync(archivoEnv, "utf8").split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
if (!env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Falta SUPABASE_SERVICE_ROLE_KEY en .env.local.");
  process.exit(2);
}
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const MARCA = "__PRUEBA_CLAUDE_NC__";

async function limpiar() {
  // Borrar la NC y la entrega se lleva sus aplicaciones e imputaciones (cascade).
  await sb.from("notas_credito_proveedor").delete().eq("proveedor", MARCA);
  await sb.from("entregas_proveedor").delete().eq("proveedor", MARCA);
  await sb.from("movimientos").delete().eq("proveedor", MARCA);
}

/*
 * Cada rechazo se compara contra SU motivo: si se aceptara cualquier error, una tabla que no
 * existe haría pasar todos los checks de "rechaza…" sin probar nada.
 *   23514 = un CHECK de la tabla (monto > 0)
 *   "supera" = el trigger de topes
 *   42501 = RLS
 */
const porCheck = (e: { code?: string } | null) => e?.code === "23514";
const porTope = (e: { message?: string } | null) => !!e?.message?.includes("supera");
const detalle = (e: { code?: string; message?: string } | null) => (e ? `${e.code} ${e.message?.slice(0, 70)}` : "LA DEJÓ PASAR");

try {
  console.log("=== 1-2: las tablas existen ===");
  // Un select común y no HEAD: con HEAD, PostgREST no manda el cuerpo y el error de "no existe la
  // tabla" llega vacío, así que el check pasaba sin la migración aplicada.
  let faltan = false;
  for (const tabla of ["notas_credito_proveedor", "aplicaciones_nota_credito"]) {
    const { error } = await sb.from(tabla).select("id").limit(1);
    ok(!error, `La tabla ${tabla} existe`, error ? error.message : "ok");
    if (error) faltan = true;
  }
  if (faltan) {
    console.log("\nFalta aplicar supabase/038_notas_credito_proveedor.sql en el editor SQL de Supabase.");
    process.exit(1);
  }

  console.log("\n=== 4: RLS — sin sesión no se ve ni se carga nada ===");
  const lectura = await anon.from("notas_credito_proveedor").select("id").limit(1);
  ok(!lectura.error && (lectura.data ?? []).length === 0, "Sin sesión no se lee ninguna NC", lectura.error?.message ?? `${(lectura.data ?? []).length} filas`);
  const escritura = await anon.from("notas_credito_proveedor").insert({ proveedor: MARCA, fecha: "2026-11-23", monto: 1 });
  ok(escritura.error?.code === "42501", "Sin sesión no se puede cargar una NC", detalle(escritura.error));

  console.log("\n=== 1: montos válidos ===");
  const cero = await sb.from("notas_credito_proveedor").insert({ proveedor: MARCA, fecha: "2026-11-23", monto: 0 });
  ok(porCheck(cero.error), "Rechaza una NC de $0", detalle(cero.error));
  const negativa = await sb.from("notas_credito_proveedor").insert({ proveedor: MARCA, fecha: "2026-11-23", monto: -10 });
  ok(porCheck(negativa.error), "Rechaza una NC negativa", detalle(negativa.error));

  console.log("\n=== 3: topes en el servidor ===");
  // Boleta de $1.000, un pago de $600 aplicado a ella y una NC de $500.
  const { data: ent } = await sb.from("entregas_proveedor").insert({ proveedor: MARCA, fecha: "2026-11-23", monto: 1000, comprobante: MARCA }).select().single();
  const { data: mv } = await sb.from("movimientos").insert({ fecha: "2026-11-23", descripcion: MARCA, categoria: "Pago a Proveedor", egreso: 600, proveedor: MARCA }).select().single();
  const { data: nc } = await sb.from("notas_credito_proveedor").insert({ proveedor: MARCA, fecha: "2026-11-23", monto: 500, comprobante: MARCA }).select().single();
  ok(!!ent && !!mv && !!nc, "Se crean boleta, pago y NC de prueba");

  if (ent && mv && nc) {
    const imp = await sb.from("imputaciones_pago").insert({ movimiento_id: mv.id, entrega_id: ent.id, monto: 600 });
    ok(!imp.error, "El pago de $600 se aplica a la boleta de $1.000", imp.error?.message ?? "ok");

    const pasada = await sb.from("aplicaciones_nota_credito").insert({ nota_id: nc.id, entrega_id: ent.id, monto: 450 });
    ok(porTope(pasada.error), "Rechaza aplicar $450 de NC: con el pago sumarían $1.050 sobre $1.000", detalle(pasada.error));

    const justa = await sb.from("aplicaciones_nota_credito").insert({ nota_id: nc.id, entrega_id: ent.id, monto: 400 });
    ok(!justa.error, "Acepta $400 de NC: la boleta queda cubierta justo", justa.error?.message ?? "ok");

    // La boleta ya está cubierta: ahora un pago nuevo tampoco puede entrar (el trigger de pagos cuenta las NC).
    const { data: mv2 } = await sb.from("movimientos").insert({ fecha: "2026-11-23", descripcion: MARCA, categoria: "Pago a Proveedor", egreso: 100, proveedor: MARCA }).select().single();
    const imp2 = await sb.from("imputaciones_pago").insert({ movimiento_id: mv2.id, entrega_id: ent.id, monto: 1 });
    ok(porTope(imp2.error), "Rechaza aplicar un pago a una boleta ya cubierta con NC (validar_imputacion cuenta las NC)", detalle(imp2.error));

    // La NC tiene $100 libres: no se pueden aplicar $150 en otra boleta.
    const { data: ent2 } = await sb.from("entregas_proveedor").insert({ proveedor: MARCA, fecha: "2026-11-23", monto: 9999, comprobante: MARCA }).select().single();
    const deMas = await sb.from("aplicaciones_nota_credito").insert({ nota_id: nc.id, entrega_id: ent2.id, monto: 150 });
    ok(porTope(deMas.error), "Rechaza aplicar más de lo que le queda a la NC ($150 de $100)", detalle(deMas.error));
    const resto = await sb.from("aplicaciones_nota_credito").insert({ nota_id: nc.id, entrega_id: ent2.id, monto: 100 });
    ok(!resto.error, "Acepta el resto de la NC ($100) en otra boleta", resto.error?.message ?? "ok");

    const montoCero = await sb.from("aplicaciones_nota_credito").insert({ nota_id: nc.id, entrega_id: ent2.id, monto: 0 });
    ok(porCheck(montoCero.error), "Rechaza una aplicación de $0", detalle(montoCero.error));

    console.log("\n=== 2: borrar la NC se lleva sus aplicaciones ===");
    await sb.from("notas_credito_proveedor").delete().eq("id", nc.id);
    const { count } = await sb.from("aplicaciones_nota_credito").select("*", { count: "exact", head: true }).eq("nota_id", nc.id);
    ok(count === 0, "Borrar la NC borra sus aplicaciones (cascade)", `quedaron ${count}`);
  }
} finally {
  await limpiar();
}

const quedan = await Promise.all(
  ["notas_credito_proveedor", "entregas_proveedor", "movimientos"].map((t) => sb.from(t).select("*", { count: "exact", head: true }).eq("proveedor", MARCA)),
);
ok(quedan.every((r) => r.count === 0), "Los datos de prueba se limpiaron", quedan.map((r) => r.count).join(" / "));

console.log(`\n${fallos === 0 ? "Todo OK." : `${fallos} check(s) fallaron.`}`);
process.exit(fallos === 0 ? 0 : 1);
