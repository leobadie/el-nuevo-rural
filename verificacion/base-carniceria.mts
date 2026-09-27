/*
 * Verificación de que la migración 020 quedó bien aplicada en Supabase: las cuatro tablas, los
 * 19 cortes de la planilla cargados una sola vez, que un dato guardado se lee igual (es lo que
 * hace que al recargar la página sigan tus números) y los controles de la base.
 *
 * Uso: npm run verificar:base-carniceria   (después de pegar supabase/020 en el editor SQL)
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
const CLAVE = "zz_prueba_claude";

async function main() {
  console.log("=== Tablas ===");
  const tablas = ["carniceria_parametros", "carniceria_cortes", "carniceria_medias_reses", "carniceria_gastos_fijos"];
  for (const t of tablas) {
    // Sin head: con head:true una tabla inexistente no devuelve error.
    const { error } = await sb.from(t).select("*").limit(1);
    ok(!error, `Existe ${t}`, error?.message ?? "");
  }
  if (fallos) {
    console.log("\nFalta aplicar supabase/020_carniceria.sql en el editor SQL de Supabase.");
    process.exit(1);
  }

  console.log("\n=== Cortes de la planilla ===");
  const { data: cortes } = await sb.from("carniceria_cortes").select("nombre, fijo, kilos_desposte, precio_pizarra");
  const lomo = cortes?.filter((c: { nombre: string }) => c.nombre === "Lomo") ?? [];
  ok(lomo.length === 1, "El Lomo está una sola vez (la carga inicial no se duplica)", lomo.length);
  const fijos = (cortes ?? []).filter((c: { fijo: boolean }) => c.fijo).map((c: { nombre: string }) => c.nombre).sort().join(", ");
  ok((cortes?.length ?? 0) >= 19, "Están los 19 cortes (o más, si ya agregaste)", cortes?.length ?? 0);
  console.log(`      Cortes fijos hoy: ${fijos || "ninguno"}`);

  console.log("\n=== Guardar y releer (lo que hace que al recargar sigan tus números) ===");
  const { error: e1 } = await sb.from("carniceria_parametros").upsert({ clave: CLAVE, valor: 2.6 });
  const { data: leido } = await sb.from("carniceria_parametros").select("valor").eq("clave", CLAVE).single();
  ok(!e1 && Number(leido?.valor) === 2.6, "Un parámetro guardado vuelve igual", `${leido?.valor}`);
  await sb.from("carniceria_parametros").upsert({ clave: CLAVE, valor: 18 });
  const { data: leido2 } = await sb.from("carniceria_parametros").select("valor").eq("clave", CLAVE).single();
  ok(Number(leido2?.valor) === 18, "Guardar otra vez la misma clave la pisa, no la duplica", `${leido2?.valor}`);

  console.log("\n=== Medias reses ===");
  const base = { fecha: "2026-09-26", abastecedor: MARCA, especie: "vaca", kg_factura: 110, precio_kg: 10600 };
  const { data: media, error: e2 } = await sb.from("carniceria_medias_reses")
    .insert({ ...base, kg_balanza: 109, hueso_kg: 18, grasa_kg: 7, merma_kg: 2.6, precio_grasero: 800 }).select().single();
  ok(!e2 && Number(media?.merma_kg) === 2.6, "Se guarda una media res con su desposte", e2?.message ?? "");
  const { error: e3 } = await sb.from("carniceria_medias_reses").insert({ ...base, hueso_kg: 60, grasa_kg: 30, merma_kg: 20 });
  ok(!!e3, "La base rechaza un desposte que pesa más que la media res", e3?.message ?? "lo aceptó");
  const { error: e4 } = await sb.from("carniceria_medias_reses").insert({ ...base, especie: "pollo" });
  ok(!!e4, "La base rechaza una especie que no es vaca ni cerdo", e4?.message ?? "lo aceptó");
  const { error: e5 } = await sb.from("carniceria_medias_reses").insert({ ...base, kg_factura: 0 });
  ok(!!e5, "La base rechaza 0 kg de factura", e5?.message ?? "lo aceptó");

  console.log("\n=== Gastos fijos ===");
  const { data: gasto } = await sb.from("gastos_fijos").insert({ descripcion: MARCA, categoria: "Servicios", monto: 1, activo: false }).select().single();
  const { error: e6 } = await sb.from("carniceria_gastos_fijos").insert({ gasto_fijo_id: gasto?.id, incluido: false });
  ok(!e6, "Se puede excluir un gasto fijo de la carnicería", e6?.message ?? "");
  await sb.from("gastos_fijos").delete().eq("id", gasto?.id);
  const { data: huerfano } = await sb.from("carniceria_gastos_fijos").select("gasto_fijo_id").eq("gasto_fijo_id", gasto?.id);
  ok((huerfano?.length ?? 1) === 0, "Borrar el gasto fijo en Ingresos y Egresos borra su marca en la carnicería");
}

try {
  await main();
} finally {
  await sb.from("carniceria_parametros").delete().eq("clave", CLAVE);
  await sb.from("carniceria_medias_reses").delete().eq("abastecedor", MARCA);
  await sb.from("gastos_fijos").delete().eq("descripcion", MARCA);
}
console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} FALLA(S)`}`);
process.exit(fallos === 0 ? 0 : 1);
