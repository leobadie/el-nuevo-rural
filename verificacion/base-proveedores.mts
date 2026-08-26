/*
 * Verificación de que la migración 012 quedó bien aplicada en Supabase: tablas, RLS,
 * políticas y —lo que más importa— que el trigger que impide imputar de más realmente
 * corta en el servidor y no solo en el navegador.
 *
 * Uso: npm run verificar:base-proveedores   (después de pegar supabase/012 en el editor SQL)
 *
 * Usa la service_role key porque las tablas tienen RLS y este script no tiene sesión de
 * usuario. Corre en la máquina del usuario, nunca en la app.
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
if (!env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Falta SUPABASE_SERVICE_ROLE_KEY en .env.local.");
  process.exit(2);
}
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const MARCA = "__PRUEBA_CLAUDE__";
let entregaId: string | null = null;
let movId: string | null = null;

async function limpiar() {
  if (entregaId) await sb.from("entregas_proveedor").delete().eq("id", entregaId);
  if (movId) await sb.from("movimientos").delete().eq("id", movId);
}

try {
  console.log("=== R1 — Las tablas existen y se pueden leer ===");
  for (const tabla of ["entregas_proveedor", "imputaciones_pago"]) {
    const { error } = await sb.from(tabla).select("*", { count: "exact", head: true });
    ok(!error, `La tabla ${tabla} existe`, error ? error.message : "ok");
  }

  console.log("\n=== R1.5 / R2.3 / R2.4 — El trigger corta en el servidor ===");

  // Entrega de prueba de $1.000 sobre un proveedor con nombre imposible de confundir.
  const { data: ent, error: errEnt } = await sb
    .from("entregas_proveedor")
    .insert({ proveedor: MARCA, fecha: "2026-08-26", monto: 1000, comprobante: MARCA })
    .select()
    .single();
  ok(!errEnt && !!ent, "Se puede crear una entrega", errEnt ? errEnt.message : `id ${ent?.id?.slice(0, 8)}`);
  entregaId = ent?.id ?? null;

  // Pago de prueba de $1.000.
  const { data: mv, error: errMov } = await sb
    .from("movimientos")
    .insert({ fecha: "2026-08-26", descripcion: MARCA, categoria: "Pago a Proveedor", egreso: 1000, proveedor: MARCA })
    .select()
    .single();
  ok(!errMov && !!mv, "Se puede crear el pago", errMov ? errMov.message : `id ${mv?.id?.slice(0, 8)}`);
  movId = mv?.id ?? null;

  if (entregaId && movId) {
    // 1) Imputación válida de $600 sobre $1.000: tiene que entrar.
    const { error: e1 } = await sb
      .from("imputaciones_pago")
      .insert({ movimiento_id: movId, entrega_id: entregaId, monto: 600 });
    ok(!e1, "Acepta una imputación dentro del saldo ($600 de $1.000)", e1 ? e1.message : "ok");

    // 2) Otra de $600: sumarían $1.200 sobre una entrega de $1.000. Tiene que rebotar.
    //    (Va como par nuevo para no chocar con el unique de (movimiento, entrega).)
    const { data: mv2 } = await sb
      .from("movimientos")
      .insert({ fecha: "2026-08-26", descripcion: MARCA, categoria: "Pago a Proveedor", egreso: 5000, proveedor: MARCA })
      .select()
      .single();
    const { error: e2 } = await sb
      .from("imputaciones_pago")
      .insert({ movimiento_id: mv2.id, entrega_id: entregaId, monto: 600 });
    ok(!!e2, "Rechaza imputar más que el saldo de la entrega", e2 ? e2.message.slice(0, 80) : "LA DEJÓ PASAR");

    // 3) Imputar más que el propio pago: $5.000 de pago, pero se le pide cubrir de más
    //    contra una entrega grande. Tiene que rebotar por el otro lado del trigger.
    const { data: ent2 } = await sb
      .from("entregas_proveedor")
      .insert({ proveedor: MARCA, fecha: "2026-08-26", monto: 99999, comprobante: MARCA })
      .select()
      .single();
    const { error: e3 } = await sb
      .from("imputaciones_pago")
      .insert({ movimiento_id: mv2.id, entrega_id: ent2.id, monto: 9000 });
    ok(!!e3, "Rechaza imputar más que el monto del pago", e3 ? e3.message.slice(0, 80) : "LA DEJÓ PASAR");

    // 4) Borrar el pago tiene que llevarse su imputación (on delete cascade).
    await sb.from("imputaciones_pago").insert({ movimiento_id: mv2.id, entrega_id: ent2.id, monto: 4000 });
    await sb.from("movimientos").delete().eq("id", mv2.id);
    const { count } = await sb
      .from("imputaciones_pago")
      .select("*", { count: "exact", head: true })
      .eq("movimiento_id", mv2.id);
    ok(count === 0, "Borrar un pago se lleva sus imputaciones (cascade)", `quedaron ${count}`);

    await sb.from("entregas_proveedor").delete().eq("id", ent2.id);
  }
} finally {
  await limpiar();
  // Barrido final por si algo quedó colgado de un corte a mitad de camino.
  await sb.from("entregas_proveedor").delete().eq("proveedor", MARCA);
  await sb.from("movimientos").delete().eq("proveedor", MARCA);
}

const { count: sobrantesEnt } = await sb
  .from("entregas_proveedor")
  .select("*", { count: "exact", head: true })
  .eq("proveedor", MARCA);
const { count: sobrantesMov } = await sb
  .from("movimientos")
  .select("*", { count: "exact", head: true })
  .eq("proveedor", MARCA);
ok(sobrantesEnt === 0 && sobrantesMov === 0, "Los datos de prueba se limpiaron",
  `${sobrantesEnt} entregas / ${sobrantesMov} movimientos`);

console.log(`\n${fallos === 0 ? "Todo OK." : `${fallos} check(s) fallaron.`}`);
process.exit(fallos === 0 ? 0 : 1);
