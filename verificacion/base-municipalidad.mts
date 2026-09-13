/*
 * Verificación de que la migración 018 quedó bien aplicada en Supabase: tablas, número de
 * factura único, y —lo que más importa— que los triggers que impiden aplicar de más cortan en
 * el servidor y no solo en el navegador.
 *
 * Uso: npm run verificar:base-municipalidad   (después de pegar supabase/018 en el editor SQL)
 *
 * Usa la service_role key porque las tablas tienen RLS y este script no tiene sesión. Las filas
 * de prueba que crea se borran al final, pasen o fallen los checks.
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
  for (const linea of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
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
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const MARCA = "__PRUEBA_CLAUDE__";

async function limpiar() {
  // Cascade: borrar facturas y cobros de prueba se lleva sus imputaciones.
  await sb.from("facturas_municipalidad").delete().like("numero_factura", `${MARCA}%`);
  await sb.from("cobros_municipalidad").delete().eq("comprobante", MARCA);
}

try {
  console.log("=== R1 — Las tablas existen ===");
  // Con head:true una tabla ausente vuelve sin error: hay que pedir una columna de verdad.
  for (const [tabla, col] of [
    ["facturas_municipalidad", "numero_factura"],
    ["cobros_municipalidad", "retenciones"],
    ["imputaciones_cobro_municipalidad", "factura_id"],
  ]) {
    const { error } = await sb.from(tabla).select(col).limit(1);
    ok(!error, `La tabla ${tabla} existe`, error ? `${error.code} ${error.message}` : "ok");
  }
  if (fallos > 0) throw new Error("Falta aplicar supabase/018_municipalidad.sql");

  console.log("\n=== R1.2 — Número de factura único ===");
  const { data: f1, error: e1 } = await sb.from("facturas_municipalidad")
    .insert({ fecha_entrega: "2026-09-01", numero_factura: `${MARCA}1`, monto: 1000 }).select().single();
  ok(!e1 && !!f1, "Se puede crear una factura", e1?.message ?? "ok");
  const { error: eDup } = await sb.from("facturas_municipalidad")
    .insert({ fecha_entrega: "2026-09-02", numero_factura: `${MARCA}1`, monto: 5 });
  ok(eDup?.code === "23505", "Rechaza un número de factura repetido", eDup ? eDup.code : "LA DEJÓ PASAR");
  const { error: eSinNum } = await sb.from("facturas_municipalidad")
    .insert([{ fecha_entrega: "2026-09-02", numero_factura: null, monto: 1, detalle: MARCA }, { fecha_entrega: "2026-09-02", numero_factura: null, monto: 1, detalle: MARCA }]);
  ok(!eSinNum, "Deja cargar varias facturas sin número", eSinNum?.message ?? "ok");
  await sb.from("facturas_municipalidad").delete().eq("detalle", MARCA);

  console.log("\n=== R1.3 — Cobros ===");
  const { error: eCero } = await sb.from("cobros_municipalidad").insert({ fecha: "2026-09-05", monto_cobrado: 0, retenciones: 0, comprobante: MARCA });
  ok(!!eCero, "Rechaza un cobro de total $0", eCero ? eCero.code : "LA DEJÓ PASAR");
  const { data: c1, error: eC1 } = await sb.from("cobros_municipalidad")
    .insert({ fecha: "2026-09-05", monto_cobrado: 900, retenciones: 100, medio_pago: "Transferencia", comprobante: MARCA }).select().single();
  ok(!eC1 && !!c1, "Se puede crear un cobro con retenciones", eC1?.message ?? "ok");

  if (f1 && c1) {
    console.log("\n=== R1.5 — Topes en el servidor ===");
    const { error: i1 } = await sb.from("imputaciones_cobro_municipalidad").insert({ cobro_id: c1.id, factura_id: f1.id, monto: 600 });
    ok(!i1, "Acepta aplicar $600 de un cobro de $1.000 a una factura de $1.000", i1?.message ?? "ok");

    const { error: i2 } = await sb.from("imputaciones_cobro_municipalidad").insert({ cobro_id: c1.id, factura_id: f1.id, monto: 400 });
    ok(!i2, "Deja volver a aplicar el mismo cobro a la misma factura (lo que quedaba libre)", i2?.message ?? "ok");

    const { data: f2 } = await sb.from("facturas_municipalidad")
      .insert({ fecha_entrega: "2026-09-03", numero_factura: `${MARCA}2`, monto: 99999 }).select().single();
    const { error: i3 } = await sb.from("imputaciones_cobro_municipalidad").insert({ cobro_id: c1.id, factura_id: f2.id, monto: 1 });
    ok(!!i3, "Rechaza aplicar más que el total del cobro (cobrado + retenciones)", i3 ? i3.message.slice(0, 70) : "LA DEJÓ PASAR");

    const { data: c2 } = await sb.from("cobros_municipalidad")
      .insert({ fecha: "2026-09-06", monto_cobrado: 5000, comprobante: MARCA }).select().single();
    const { error: i4 } = await sb.from("imputaciones_cobro_municipalidad").insert({ cobro_id: c2.id, factura_id: f1.id, monto: 1 });
    ok(!!i4, "Rechaza aplicar a una factura ya cobrada entera", i4 ? i4.message.slice(0, 70) : "LA DEJÓ PASAR");

    const { error: u1 } = await sb.from("facturas_municipalidad").update({ monto: 999 }).eq("id", f1.id);
    ok(!!u1, "Rechaza bajar el monto de una factura por debajo de lo cobrado", u1 ? u1.message.slice(0, 70) : "LA DEJÓ PASAR");
    const { error: u2 } = await sb.from("cobros_municipalidad").update({ retenciones: 0 }).eq("id", c1.id);
    ok(!!u2, "Rechaza bajar el total de un cobro por debajo de lo aplicado", u2 ? u2.message.slice(0, 70) : "LA DEJÓ PASAR");

    console.log("\n=== R1.6 — Cascade ===");
    await sb.from("cobros_municipalidad").delete().eq("id", c1.id);
    const { data: quedan } = await sb.from("imputaciones_cobro_municipalidad").select("id").eq("factura_id", f1.id);
    ok(quedan?.length === 0, "Borrar un cobro se lleva sus imputaciones", `quedaron ${quedan?.length}`);
    const { data: facturaSigue } = await sb.from("facturas_municipalidad").select("id").eq("id", f1.id);
    ok(facturaSigue?.length === 1, "…y la factura sigue ahí");
  }
} catch (e) {
  console.error(String(e));
} finally {
  await limpiar();
}

const { data: sobrantes } = await sb.from("facturas_municipalidad").select("id").like("numero_factura", `${MARCA}%`);
if (sobrantes) ok(sobrantes.length === 0, "Los datos de prueba se limpiaron", `${sobrantes.length} facturas`);

console.log(`\n${fallos === 0 ? "Todo OK." : `${fallos} check(s) fallaron.`}`);
process.exit(fallos === 0 ? 0 : 1);
