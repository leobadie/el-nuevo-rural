/*
 * Verificación de que la migración 025 quedó bien aplicada (SPEC-descuento-proveedores.md,
 * punto 10): las columnas nuevas, que la base rechace un % fuera de rango o una boleta que no
 * cierra, y que el tope de pagos (012) use lo que se debe.
 *
 * Uso: npm run verificar:base-descuento   (después de pegar supabase/025 en el editor SQL)
 *
 * Trabaja sólo con un proveedor y entregas marcados, que se borran al final pasen o fallen los
 * checks. No toca a Santa Rita ni a ningún proveedor real.
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
for (const linea of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const MARCA = "__PRUEBA_CLAUDE_DESCUENTO__";

async function limpiar() {
  // Primero el pago (sus imputaciones se van en cascada), después las entregas y el proveedor.
  await sb.from("movimientos").delete().eq("proveedor", MARCA);
  await sb.from("entregas_proveedor").delete().eq("proveedor", MARCA);
  await sb.from("proveedores").delete().eq("nombre", MARCA);
}

try {
  await limpiar();
  console.log("=== Las columnas (025) ===");
  const { error: sin } = await sb.from("proveedores").select("descuento_pct").limit(1);
  const { error: sinE } = await sb.from("entregas_proveedor").select("monto_boleta, descuento_pct").limit(1);
  if (sin || sinE) {
    ok(false, "Existen las columnas nuevas: falta aplicar supabase/025_descuento_proveedores.sql", (sin ?? sinE)!.message);
  } else {
    ok(true, "proveedores.descuento_pct y entregas_proveedor.monto_boleta / descuento_pct existen");

    const { data: prov, error: eProv } = await sb.from("proveedores").insert({ nombre: MARCA, descuento_pct: 5 }).select().single();
    ok(!eProv && Number(prov?.descuento_pct) === 5, "Un proveedor guarda su 5%", eProv?.message ?? "");
    const { error: eMal } = await sb.from("proveedores").update({ descuento_pct: 100 }).eq("nombre", MARCA);
    ok(!!eMal, "La base rechaza un 100% de descuento", eMal?.message ?? "lo aceptó");

    const base = { proveedor: MARCA, fecha: "2026-09-27", comprobante: MARCA };
    const { data: ent, error: eEnt } = await sb.from("entregas_proveedor").insert({ ...base, monto: 95000, monto_boleta: 100000, descuento_pct: 5 }).select().single();
    ok(!eEnt && Number(ent?.monto) === 95000 && Number(ent?.monto_boleta) === 100000, "Una boleta de $ 100.000 con 5% guarda $ 95.000 a deber", eEnt?.message ?? "");
    const { error: eSinPct } = await sb.from("entregas_proveedor").insert({ ...base, monto: 95000, monto_boleta: 100000 });
    ok(!!eSinPct, "La base rechaza una boleta sin el % (van juntos)", eSinPct?.message ?? "lo aceptó");
    const { error: eSinBoleta } = await sb.from("entregas_proveedor").insert({ ...base, monto: 95000, descuento_pct: 5 });
    ok(!!eSinBoleta, "…y un % sin el importe de la boleta", eSinBoleta?.message ?? "lo aceptó");
    const { error: eNoCierra } = await sb.from("entregas_proveedor").insert({ ...base, monto: 100000, monto_boleta: 100000, descuento_pct: 5 });
    ok(!!eNoCierra, "…y una donde lo que se debe no es menos que la boleta", eNoCierra?.message ?? "lo aceptó");
    const { error: eComun } = await sb.from("entregas_proveedor").insert({ ...base, monto: 50000 });
    ok(!eComun, "Una boleta sin descuento se carga como siempre", eComun?.message ?? "");

    // El tope del trigger 012 usa monto (lo que se debe): no se pueden aplicar $ 100.000.
    const { data: pago } = await sb.from("movimientos").insert({ fecha: "2026-09-27", descripcion: MARCA, egreso: 100000, proveedor: MARCA }).select().single();
    const { error: eTope } = await sb.from("imputaciones_pago").insert({ movimiento_id: pago?.id, entrega_id: ent?.id, monto: 100000 });
    ok(!!eTope, "No se puede aplicar a la boleta más que lo que se debe ($ 95.000)", eTope?.message ?? "aplicó $ 100.000");
    const { error: eJusto } = await sb.from("imputaciones_pago").insert({ movimiento_id: pago?.id, entrega_id: ent?.id, monto: 95000 });
    ok(!eJusto, "Los $ 95.000 sí se aplican", eJusto?.message ?? "");
  }
} finally {
  await limpiar();
}

console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} FALLA(S)`}`);
// exitCode y no process.exit(): cortar con conexiones abiertas hace fallar a Node en Windows.
process.exitCode = fallos === 0 ? 0 : 1;
